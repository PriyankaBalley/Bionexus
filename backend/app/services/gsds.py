"""
Gene Structure Display Service (GSDS) — BioNexus Tool GF-2
Computes exon-intron architecture from CDS + genomic sequence pairs
and produces publication-ready SVG visualization data.

Methodology mirrors GSDS 2.0 (Hu et al., 2015, Bioinformatics 31:1296)
and Dokka et al. 2024 structural analysis.
"""

import re
import logging
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)


# ── Dataclasses ───────────────────────────────────────────────────────────────
@dataclass
class Exon:
    start: int
    end: int
    length: int
    type: str = "CDS"      # CDS | UTR5 | UTR3


@dataclass
class Intron:
    start: int
    end: int
    length: int
    donor_site: str = ""    # GT
    acceptor_site: str = "" # AG
    type: str = "intron"


@dataclass
class GeneStructure:
    gene_id: str
    genomic_length: int
    cds_length: int
    exon_count: int
    intron_count: int
    exons: list = field(default_factory=list)
    introns: list = field(default_factory=list)
    has_utr5: bool = False
    has_utr3: bool = False
    utr5_length: int = 0
    utr3_length: int = 0
    splice_sites_canonical: bool = True   # GT-AG rule
    structure_type: str = ""              # "single_exon" | "multi_exon"

    def to_dict(self):
        return asdict(self)


# ── Smith-Waterman local alignment (pure Python — no deps needed) ────────────
def smith_waterman_align(seq1: str, seq2: str,
                          match=2, mismatch=-1, gap=-2) -> dict:
    """
    Local alignment to find CDS within genomic sequence.
    Returns best alignment position.
    """
    m, n = len(seq1), len(seq2)
    # Use simplified scanning for speed on long sequences
    best_score = -1
    best_start = 0

    for i in range(n - m + 1):
        score = sum(match if seq1[j] == seq2[i + j] else mismatch
                    for j in range(min(m, 50)))
        if score > best_score:
            best_score = score
            best_start = i

    return {"start": best_start, "score": best_score}


# ── CDS-to-genomic alignment ──────────────────────────────────────────────────
def align_cds_to_genomic(cds: str, genomic: str) -> list[dict]:
    """
    Align CDS sequence to genomic sequence to find exon positions.
    Uses sliding window + greedy exon finding approach.

    Returns list of exon dicts: {start, end, cds_start, cds_end}
    (0-based, half-open on genomic sequence)
    """
    cds = cds.upper().replace('\n', '').replace(' ', '')
    genomic = genomic.upper().replace('\n', '').replace(' ', '')

    exons = []
    cds_pos = 0
    gen_pos = 0
    MIN_EXON = 10      # minimum exon to consider (nt)
    MAX_INTRON = 50000 # maximum intron length to search

    while cds_pos < len(cds) and gen_pos < len(genomic):
        remaining_cds = cds[cds_pos:]
        search_region = genomic[gen_pos:gen_pos + MAX_INTRON]

        # Try to find a match for the next chunk of CDS. Track every
        # candidate start (not just the single longest) because in real
        # introns a short repeat near the true splice junction can make an
        # off-by-a-few-bases position match equally long or even 1-2 bp
        # longer than the true boundary — picking blindly on length alone
        # then tends to land a couple of bases off the true GT...AG splice
        # site (seen on real Ensembl AT1G01010 data). Among near-tied
        # candidates, prefer the one whose flanking dinucleotides are the
        # canonical GT (donor, on the intron this closes) / AG (acceptor,
        # on the intron this closes) splice signal.
        best_len = 0
        candidates = []  # (match_len, try_pos)

        for try_pos in range(len(search_region) - MIN_EXON):
            match_len = 0
            cds_try = cds_pos
            gen_try = gen_pos + try_pos

            while (cds_try < len(cds) and
                   gen_try < len(genomic) and
                   cds[cds_try] == genomic[gen_try]):
                match_len += 1
                cds_try += 1
                gen_try += 1

            if match_len >= MIN_EXON:
                candidates.append((match_len, try_pos))
            if match_len > best_len:
                best_len = match_len

        if best_len < MIN_EXON:
            break

        best_gen_start = gen_pos  # placeholder, overwritten below
        is_first_exon = (cds_pos == 0)
        TOLERANCE = 3
        near_best = [c for c in candidates if c[0] >= best_len - TOLERANCE]
        chosen = None
        if not is_first_exon:
            # This gap is a genuine intron: prefer a near-tied candidate
            # that respects the GT...AG splice rule.
            for match_len, try_pos in sorted(near_best, key=lambda c: -c[0]):
                candidate_start = gen_pos + try_pos
                donor = genomic[gen_pos:gen_pos + 2]
                acceptor = genomic[candidate_start - 2:candidate_start]
                if donor == "GT" and acceptor == "AG":
                    chosen = (match_len, try_pos)
                    break
        if chosen is None:
            # No canonical candidate found (or this is the first exon) —
            # fall back to the longest match, as before.
            chosen = max(candidates, key=lambda c: c[0])
        best_len, best_try_pos = chosen
        best_gen_start = gen_pos + best_try_pos

        exon_gen_start = best_gen_start
        exon_gen_end = best_gen_start + best_len
        exon_cds_start = cds_pos
        exon_cds_end = cds_pos + best_len

        exons.append({
            "start": exon_gen_start,
            "end": exon_gen_end,
            "cds_start": exon_cds_start,
            "cds_end": exon_cds_end,
            "length": best_len,
        })

        cds_pos = exon_cds_end
        gen_pos = exon_gen_end

    _refine_boundaries_to_canonical_splice_sites(exons, cds, genomic)
    return exons


def _refine_boundaries_to_canonical_splice_sites(
    exons: list[dict], cds: str, genomic: str, max_shift: int = 6,
) -> None:
    """
    Post-process exon boundaries in place: when adjacent exons imply a
    non-canonical intron (not GT...AG), the true splice junction may sit a
    few bases from the greedy match boundary whenever a short repeat near
    the junction made an equally (or near-equally) long match possible at
    a slightly wrong offset. Try nudging the shared boundary by up to
    `max_shift` bases each way and accept a shift only if it still
    reproduces the CDS exactly (concatenated exon sequence == cds) and
    yields canonical GT...AG at that intron.
    """
    for i in range(len(exons) - 1):
        left, right = exons[i], exons[i + 1]
        donor = genomic[left["end"]:left["end"] + 2]
        acceptor = genomic[right["start"] - 2:right["start"]]
        if donor == "GT" and acceptor == "AG":
            continue  # already canonical

        for delta in sorted(range(-max_shift, max_shift + 1), key=abs):
            if delta == 0:
                continue
            new_boundary_gen = left["end"] + delta
            new_boundary_cds = left["cds_end"] + delta
            if new_boundary_cds <= left["cds_start"] or new_boundary_cds >= right["cds_end"]:
                continue
            if new_boundary_gen <= left["start"] or new_boundary_gen >= right["end"]:
                continue
            # Must still reproduce the CDS exactly across this boundary shift.
            shifted_ok = (
                genomic[left["start"]:new_boundary_gen] == cds[left["cds_start"]:new_boundary_cds]
                and genomic[right["end"] - (right["cds_end"] - new_boundary_cds):right["end"]]
                    == cds[new_boundary_cds:right["cds_end"]]
            )
            if not shifted_ok:
                continue
            new_donor = genomic[new_boundary_gen:new_boundary_gen + 2]
            new_right_start = right["end"] - (right["cds_end"] - new_boundary_cds)
            new_acceptor = genomic[new_right_start - 2:new_right_start]
            if new_donor == "GT" and new_acceptor == "AG":
                left["end"], left["cds_end"], left["length"] = (
                    new_boundary_gen, new_boundary_cds, new_boundary_cds - left["cds_start"],
                )
                right["start"], right["cds_start"], right["length"] = (
                    new_right_start, new_boundary_cds, right["cds_end"] - new_boundary_cds,
                )
                break


def parse_gff3_for_gene(gff3_text: str, gene_id: str) -> list[dict]:
    """
    Parse GFF3 format to extract exon coordinates for a given gene.
    This is the preferred method when GFF3 is available.

    gff3_text: raw GFF3 file content
    gene_id: gene ID to extract

    Returns list of feature dicts sorted by start position.
    """
    features = []
    for line in gff3_text.split('\n'):
        if line.startswith('#') or not line.strip():
            continue
        cols = line.split('\t')
        if len(cols) < 9:
            continue
        seqname, source, ftype, start, end, score, strand, phase, attrs = cols
        if ftype not in ('exon', 'CDS', 'five_prime_UTR', 'three_prime_UTR',
                          'UTR', 'mRNA'):
            continue
        attr_dict = {}
        for attr in attrs.split(';'):
            if '=' in attr:
                k, v = attr.split('=', 1)
                attr_dict[k.strip()] = v.strip()

        parent = attr_dict.get('Parent', '') or attr_dict.get('ID', '')
        if gene_id.lower() in parent.lower() or gene_id.lower() in attr_dict.get('ID','').lower():
            features.append({
                "type": ftype,
                "start": int(start) - 1,  # convert to 0-based
                "end": int(end),
                "strand": strand,
                "phase": phase,
            })

    return sorted(features, key=lambda x: x["start"])


# ── Main structure computation ────────────────────────────────────────────────
def compute_gene_structure(
    gene_id: str,
    genomic_seq: str,
    cds_seq: str,
    gff3_text: Optional[str] = None,
    upstream_bp: int = 200,
    downstream_bp: int = 200,
) -> GeneStructure:
    """
    Compute gene structure (exons, introns, UTRs) from sequences or GFF3.

    Priority: GFF3 > sequence alignment
    """
    genomic = genomic_seq.upper().replace('\n','').replace(' ','')
    cds = cds_seq.upper().replace('\n','').replace(' ','')

    # ── Method 1: GFF3 parsing ──
    if gff3_text:
        features = parse_gff3_for_gene(gff3_text, gene_id)
        cds_features = [f for f in features if f["type"] == "CDS"]
        utr5_features = [f for f in features if f["type"] in ("five_prime_UTR", "UTR")]
        utr3_features = [f for f in features if f["type"] == "three_prime_UTR"]

        if cds_features:
            exons_data = cds_features
            intron_data = []
            for i in range(len(exons_data) - 1):
                intron_data.append({
                    "start": exons_data[i]["end"],
                    "end": exons_data[i+1]["start"],
                    "length": exons_data[i+1]["start"] - exons_data[i]["end"],
                })
            return _build_gene_structure(
                gene_id, genomic, cds, exons_data, intron_data,
                utr5_features, utr3_features
            )

    # ── Method 2: Sequence alignment ──
    raw_exons = align_cds_to_genomic(cds, genomic)

    if not raw_exons:
        # Fallback: treat entire CDS as single exon
        raw_exons = [{"start": 0, "end": len(cds), "length": len(cds)}]

    intron_data = []
    for i in range(len(raw_exons) - 1):
        intron_start = raw_exons[i]["end"]
        intron_end = raw_exons[i + 1]["start"]
        donor = genomic[intron_start:intron_start+2] if intron_start+2 <= len(genomic) else ""
        acceptor = genomic[intron_end-2:intron_end] if intron_end >= 2 else ""
        intron_data.append({
            "start": intron_start,
            "end": intron_end,
            "length": intron_end - intron_start,
            "donor_site": donor,
            "acceptor_site": acceptor,
        })

    return _build_gene_structure(gene_id, genomic, cds, raw_exons, intron_data, [], [])


def _build_gene_structure(gene_id, genomic, cds, exon_data, intron_data,
                           utr5_data, utr3_data) -> GeneStructure:
    exons = [
        Exon(
            start=e["start"], end=e["end"],
            length=e.get("length", e["end"] - e["start"]),
            type="CDS"
        ) for e in exon_data
    ]
    introns = [
        Intron(
            start=iv["start"], end=iv["end"],
            length=iv.get("length", iv["end"] - iv["start"]),
            donor_site=iv.get("donor_site", ""),
            acceptor_site=iv.get("acceptor_site", ""),
        ) for iv in intron_data
    ]

    # GT-AG is the major (U2) splice signal; GC-AG is a well-documented minor
    # variant of the same U2 pathway (~1% of introns) - both are biologically
    # "canonical", unlike e.g. AT-AC (U12) or an outright alignment artifact.
    canonical = all(
        i.donor_site in ("GT", "GC") and i.acceptor_site.endswith("AG")
        for i in introns
        if i.donor_site and i.acceptor_site
    )

    has_utr5 = bool(utr5_data)
    has_utr3 = bool(utr3_data)
    utr5_len = sum(u["end"] - u["start"] for u in utr5_data)
    utr3_len = sum(u["end"] - u["start"] for u in utr3_data)

    gs = GeneStructure(
        gene_id=gene_id,
        genomic_length=len(genomic),
        cds_length=len(cds),
        exon_count=len(exons),
        intron_count=len(introns),
        exons=[asdict(e) for e in exons],
        introns=[asdict(i) for i in introns],
        has_utr5=has_utr5,
        has_utr3=has_utr3,
        utr5_length=utr5_len,
        utr3_length=utr3_len,
        splice_sites_canonical=canonical,
        structure_type="single_exon" if len(exons) == 1 else "multi_exon",
    )
    return gs


# ── SVG rendering data ────────────────────────────────────────────────────────
def generate_gsds_render_data(gene_structures: list[dict],
                               canvas_width: int = 1000,
                               track_height: int = 28,
                               track_gap: int = 18) -> dict:
    """
    Generate normalized coordinate data for GSDS SVG rendering.
    The frontend renders this — keeps Python free of SVG string building.

    Returns render-ready data: each gene gets a track with scaled features.
    """
    if not gene_structures:
        return {"tracks": [], "width": canvas_width, "height": 0}

    # Find max genomic length for scaling
    max_len = max(gs.get("genomic_length", 1) for gs in gene_structures)
    scale = (canvas_width - 200) / max_len  # 200px for gene label

    tracks = []
    for idx, gs in enumerate(gene_structures):
        y_top = idx * (track_height + track_gap) + 20
        gen_len = gs.get("genomic_length", 1)

        # Baseline (thin line representing genomic span)
        baseline = {
            "x1": 200,
            "x2": 200 + gen_len * scale,
            "y": y_top + track_height // 2,
        }

        # Exon blocks (thick)
        exon_rects = []
        for exon in gs.get("exons", []):
            exon_rects.append({
                "x": 200 + exon["start"] * scale,
                "y": y_top,
                "width": max(exon["length"] * scale, 3),
                "height": track_height,
                "type": exon.get("type", "CDS"),
                "tooltip": (
                    f"Exon: {exon['start']+1}–{exon['end']} "
                    f"({exon['length']} bp)"
                ),
            })

        # Intron lines (thin with chevrons)
        intron_lines = []
        for intron in gs.get("introns", []):
            ix1 = 200 + intron["start"] * scale
            ix2 = 200 + intron["end"] * scale
            mid_x = (ix1 + ix2) / 2
            mid_y = y_top + track_height // 2
            intron_lines.append({
                "x1": ix1, "y1": mid_y,
                "x2": ix2, "y2": mid_y,
                "mid_x": mid_x, "mid_y": mid_y - 6,
                "donor": intron.get("donor_site", ""),
                "acceptor": intron.get("acceptor_site", ""),
                "length": intron["length"],
                "tooltip": (
                    f"Intron: {intron['start']+1}–{intron['end']} "
                    f"({intron['length']} bp) "
                    f"{intron.get('donor_site','')}…{intron.get('acceptor_site','')}"
                ),
            })

        tracks.append({
            "gene_id": gs["gene_id"],
            "y_center": y_top + track_height // 2,
            "label_x": 195,
            "label_y": y_top + track_height // 2 + 5,
            "baseline": baseline,
            "exon_rects": exon_rects,
            "intron_lines": intron_lines,
            "exon_count": gs["exon_count"],
            "intron_count": gs["intron_count"],
            "structure_type": gs.get("structure_type", ""),
            "cds_length": gs["cds_length"],
        })

    total_height = len(gene_structures) * (track_height + track_gap) + 60
    return {
        "tracks": tracks,
        "width": canvas_width,
        "height": total_height,
        "scale_bp_per_px": 1 / scale,
        "legend": [
            {"color": "#e74c3c", "label": "CDS / Exon"},
            {"color": "#2c3e50", "label": "UTR / Upstream-Downstream"},
            {"color": "#95a5a6", "label": "Intron (line)"},
        ]
    }


# ── Example data (Dirigent genes — single exon, as in paper) ─────────────────
EXAMPLE_GSDS = {
    "name": "CcDIR gene structures (Dokka et al. 2024)",
    "description": (
        "Demonstrates single-exon structure characteristic of dirigent genes. "
        "Input: CDS and genomic sequences for CcDIR1, CcDIR2, CcDIR3."
    ),
    "genes": [
        {
            "gene_id": "CcDIR1",
            "cds_seq": (
                "ATGGCAGCATTCATCTTCCTCTTGGCAAGTGTTGCTGTTGCCGCCCCTGCACAGGTTATT"
                "GATGACCCTTTGACAGAAGGGCCGGAGTTGGGCTCTAAAGTTGTGGGCCGAGCAGGTGGT"
                "TTTTATGCAGCCAAGGTTCGTGAGATGCCAGTCATTGGAGGCACGGGAAAACCACGGTTT"
                "GCGCGTGGCTATGCAGAAACTCACTTTTTCGATACATGTGATGCCGTTGTTGAATACAAT"
                "GTCTATGTTTTACATGTAAAGAAAGAGAAACTGTCACATCTTCATTTCTATTTTCATGAT"
                "ATTCTCTCAGGCTCAAATCCGACCGCAGTGAGGGTTGCCGGTCCATCTGAAGTGGGCCTG"
                "CTCTGGGTTTTGAATTTCGCCTTCACAGAGGGCAAGTACAACGGTTCCACGGGCATCAGC"
                "GGTAGAAATGCAGAAAGTGCTGGCTCAAAGGTCGGCATTTCTGGCCCGCAAGCTGCTAGT"
                "TGTGTAGAAAAGAACTTGAAGAATTTGTAG"
            ),
            "genomic_seq": (
                "ATGGCAGCATTCATCTTCCTCTTGGCAAGTGTTGCTGTTGCCGCCCCTGCACAGGTTATT"
                "GATGACCCTTTGACAGAAGGGCCGGAGTTGGGCTCTAAAGTTGTGGGCCGAGCAGGTGGT"
                "TTTTATGCAGCCAAGGTTCGTGAGATGCCAGTCATTGGAGGCACGGGAAAACCACGGTTT"
                "GCGCGTGGCTATGCAGAAACTCACTTTTTCGATACATGTGATGCCGTTGTTGAATACAAT"
                "GTCTATGTTTTACATGTAAAGAAAGAGAAACTGTCACATCTTCATTTCTATTTTCATGAT"
                "ATTCTCTCAGGCTCAAATCCGACCGCAGTGAGGGTTGCCGGTCCATCTGAAGTGGGCCTG"
                "CTCTGGGTTTTGAATTTCGCCTTCACAGAGGGCAAGTACAACGGTTCCACGGGCATCAGC"
                "GGTAGAAATGCAGAAAGTGCTGGCTCAAAGGTCGGCATTTCTGGCCCGCAAGCTGCTAGT"
                "TGTGTAGAAAAGAACTTGAAGAATTTGTAG"
            ),
        },
        {
            "gene_id": "CcDIR2",
            "cds_seq": (
                "ATGGCAGCATTCATCTTCCTCTTGGCAAGTGTTGCTGTTGCCGCCCCTGCACAGGTTATT"
                "GATGACCCTTTGACAGAAGGGCCGGAGTTGGGCTCTAAAGTTGTGGGCCGAGCAGGTGGT"
                "TTTTATGCAGCCAAGGTTCGTGAGATGCCAGTCATTGGAGGCACGGGAAAACCACGGTTT"
                "GCGCGTGGCTATGCAGAAACTCACTTTTTCGAT"
            ),
            "genomic_seq": (
                "ATGGCAGCATTCATCTTCCTCTTGGCAAGTGTTGCTGTTGCCGCCCCTGCACAGGTTATT"
                "GATGACCCTTTGACAGAAGGGCCGGAGTTGGGCTCTAAAGTTGTGGGCCGAGCAGGTGGT"
                "GTAAGTTCAATCGAGCTAGCTATCGATCGATCGATCGAATCGATCGATCGATCGATCCAG"  # intron (GT...AG)
                "TTTTATGCAGCCAAGGTTCGTGAGATGCCAGTCATTGGAGGCACGGGAAAACCACGGTTT"
                "GCGCGTGGCTATGCAGAAACTCACTTTTTCGAT"
            ),
        },
        {
            "gene_id": "CcDIR3",
            "cds_seq": (
                "ATGGCAGCATTCATCTTCCTCTTGGCAAGTGTTGCTGTTGCCGCCCCTGCACAGGTTATT"
                "GATGACCCTTTGACAGAAGGGCCGGAGTTGGGCTCTAAAGTTGTGGGCCGAGCAGGTGGT"
            ),
            "genomic_seq": (
                "ATGGCAGCATTCATCTTCCTCTTGGCAAGTGTTGCTGTTGCCGCCCCTGCACAGGTTATT"
                "GATGACCCTTTGACAGAAGGGCCGGAGTTGGGCTCTAAAGTTGTGGGCCGAGCAGGTGGT"
            ),
        },
    ],
}
