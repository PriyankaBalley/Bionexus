"""
BioNexus — Cloning Design Tool
Supports: Golden Gate / MoClo, Gibson Assembly, Traditional RE-ligation, Gateway
"""

from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ─────────────────────────────────────────────
# Constants & Restriction Enzyme Database
# ─────────────────────────────────────────────

RESTRICTION_ENZYMES = {
    # Common cloning enzymes
    "EcoRI":  {"pattern": "GAATTC", "cut_fwd": 1,  "cut_rev": 5,  "overhang": 4, "type": "II"},
    "BamHI":  {"pattern": "GGATCC", "cut_fwd": 1,  "cut_rev": 5,  "overhang": 4, "type": "II"},
    "HindIII":{"pattern": "AAGCTT", "cut_fwd": 1,  "cut_rev": 5,  "overhang": 4, "type": "II"},
    "NcoI":   {"pattern": "CCATGG", "cut_fwd": 1,  "cut_rev": 5,  "overhang": 4, "type": "II"},
    "NheI":   {"pattern": "GCTAGC", "cut_fwd": 1,  "cut_rev": 5,  "overhang": 4, "type": "II"},
    "XhoI":   {"pattern": "CTCGAG", "cut_fwd": 1,  "cut_rev": 5,  "overhang": 4, "type": "II"},
    "SalI":   {"pattern": "GTCGAC", "cut_fwd": 1,  "cut_rev": 5,  "overhang": 4, "type": "II"},
    "SacI":   {"pattern": "GAGCTC", "cut_fwd": 5,  "cut_rev": 1,  "overhang": 4, "type": "II"},
    "KpnI":   {"pattern": "GGTACC", "cut_fwd": 5,  "cut_rev": 1,  "overhang": 4, "type": "II"},
    "XbaI":   {"pattern": "TCTAGA", "cut_fwd": 1,  "cut_rev": 5,  "overhang": 4, "type": "II"},
    "SmaI":   {"pattern": "CCCGGG", "cut_fwd": 3,  "cut_rev": 3,  "overhang": 0, "type": "II"},
    "NotI":   {"pattern": "GCGGCCGC","cut_fwd":2,  "cut_rev": 6,  "overhang": 4, "type": "II"},
    "PstI":   {"pattern": "CTGCAG", "cut_fwd": 5,  "cut_rev": 1,  "overhang": 4, "type": "II"},
    "SphI":   {"pattern": "GCATGC", "cut_fwd": 5,  "cut_rev": 1,  "overhang": 4, "type": "II"},
    "ClaI":   {"pattern": "ATCGAT", "cut_fwd": 2,  "cut_rev": 4,  "overhang": 2, "type": "II"},
    # Golden Gate / Type IIS
    "BsaI":   {"pattern": "GGTCTC", "cut_fwd": 7,  "cut_rev": 11, "overhang": 4, "type": "IIS"},
    "BbsI":   {"pattern": "GAAGAC", "cut_fwd": 8,  "cut_rev": 12, "overhang": 4, "type": "IIS"},
    "BsmBI":  {"pattern": "CGTCTC", "cut_fwd": 7,  "cut_rev": 11, "overhang": 4, "type": "IIS"},
    "SapI":   {"pattern": "GCTCTTC","cut_fwd": 8,  "cut_rev": 11, "overhang": 3, "type": "IIS"},
    # Gateway att sites (represented as strings)
    "attB1":  {"pattern": "ACAAGTTTGTACAAAAAAGCAGGCT", "type": "att"},
    "attB2":  {"pattern": "ACCACTTTGTACAAGAAAGCTGGGT", "type": "att"},
}

COMMON_VECTORS = {
    "golden_gate": ["pGGZ001", "pICH47732 (MoClo)", "pAGM4723 (Level 0)", "pICH86966 (Level 1)"],
    "gibson":      ["pUC19", "pBluescript SK+", "pDONR207", "pCAMBIA1300"],
    "re_ligation": ["pUC19", "pBluescript SK+", "pBR322", "pACYC184", "pET28a", "pCDNA3.1"],
    "gateway":     ["pDONR207", "pDONR221", "pDEST22", "pB7WG2", "pK7WG2 (plant)"],
}

CRISPR_VECTORS = {
    "golden_gate": ["pHSE401 (Arabidopsis)", "pYLCRISPRv2 (Rice)", "pRGEB31 (Barley)"],
    "re_ligation": ["pX330 (SpCas9)", "pX459 (SpCas9 + puro)", "pKSE401 (plant)"],
}


# ─────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────

class CloningStrategy(str, Enum):
    GOLDEN_GATE = "golden_gate"
    GIBSON      = "gibson"
    RE_LIGATION = "re_ligation"
    GATEWAY     = "gateway"


@dataclass
class Primer:
    name: str
    sequence: str
    tm: float
    gc_percent: float
    length: int
    binding_region: str
    overhang: str = ""
    notes: str = ""

    def full_sequence(self) -> str:
        return self.overhang + self.sequence


@dataclass
class RestrictionSite:
    enzyme: str
    position: int
    strand: str          # "+" or "-"
    sequence: str
    cut_position: int
    overhang_type: str   # "5'", "3'", or "blunt"
    overhang_seq: str


@dataclass
class CloningDesign:
    strategy: str
    insert_sequence: str
    insert_length: int
    vector_suggestion: list[str]
    primers: list[Primer]
    restriction_sites: list[RestrictionSite]
    construct_sequence: str
    construct_annotated: list[dict]  # [{label, start, end, color, type}]
    notes: list[str]
    warnings: list[str]
    genbank_record: str
    fasta_record: str


# ─────────────────────────────────────────────
# Utility Functions
# ─────────────────────────────────────────────

def reverse_complement(seq: str) -> str:
    comp = str.maketrans("ATGCatgcNn", "TACGtacgNn")
    return seq.translate(comp)[::-1]


def calculate_tm(seq: str) -> float:
    """Wallace rule for short oligos; nearest-neighbor approximation hint for longer."""
    seq = seq.upper()
    n = len(seq)
    if n < 14:
        return 2 * (seq.count("A") + seq.count("T")) + 4 * (seq.count("G") + seq.count("C"))
    gc = seq.count("G") + seq.count("C")
    at = seq.count("A") + seq.count("T")
    # Salt-adjusted Tm approximation
    return 64.9 + 41 * (gc - 16.4) / n


def gc_content(seq: str) -> float:
    seq = seq.upper()
    if not seq:
        return 0.0
    gc = seq.count("G") + seq.count("C")
    return round(gc / len(seq) * 100, 1)


def find_restriction_sites(seq: str, enzymes: list[str] | None = None) -> list[RestrictionSite]:
    seq_upper = seq.upper()
    sites = []
    check = enzymes if enzymes else list(RESTRICTION_ENZYMES.keys())

    for enz_name in check:
        enz = RESTRICTION_ENZYMES.get(enz_name)
        if not enz or enz.get("type") == "att":
            continue
        pattern = enz["pattern"]
        rc_pattern = reverse_complement(pattern)

        for strand, search_seq in [("+", seq_upper), ("-", seq_upper)]:
            pat = pattern if strand == "+" else rc_pattern
            for m in re.finditer(pat, search_seq):
                cut = m.start() + enz["cut_fwd"]
                oh = enz.get("overhang", 0)
                oh_type = "blunt" if oh == 0 else ("5'" if enz["cut_fwd"] < enz["cut_rev"] else "3'")
                oh_seq = seq_upper[cut:cut + oh] if oh > 0 else ""
                sites.append(RestrictionSite(
                    enzyme=enz_name,
                    position=m.start(),
                    strand=strand,
                    sequence=m.group(),
                    cut_position=cut,
                    overhang_type=oh_type,
                    overhang_seq=oh_seq,
                ))
    return sorted(sites, key=lambda x: x.position)


def design_primer(
    template: str,
    start: int,
    length: int = 20,
    name: str = "primer",
    overhang: str = "",
    rc: bool = False,
) -> Primer:
    region = template[start:start + length]
    if rc:
        region = reverse_complement(region)
    tm = calculate_tm(region)
    return Primer(
        name=name,
        sequence=region,
        tm=tm,
        gc_percent=gc_content(region),
        length=length,
        binding_region=f"{start}–{start + length}",
        overhang=overhang,
        notes="",
    )


# ─────────────────────────────────────────────
# Strategy Designers
# ─────────────────────────────────────────────

def design_golden_gate(
    insert: str,
    vector: str = "pHSE401 (Arabidopsis)",
    enzyme: str = "BsaI",
    overhang_5: str = "AACG",
    overhang_3: str = "AAAC",
    is_sgrna: bool = False,
) -> CloningDesign:
    """Golden Gate / MoClo assembly design."""
    enz = RESTRICTION_ENZYMES[enzyme]
    rec_site = enz["pattern"]
    spacer = "N" * (enz["cut_fwd"] - len(rec_site))

    # Build oligos for sgRNA or general insert
    if is_sgrna:
        # Standard CRISPR oligo design: add G if needed, complement
        guide = insert.upper()
        if not guide.startswith("G"):
            guide = "G" + guide
        fwd_oligo = overhang_5 + guide
        rev_oligo = reverse_complement(overhang_3 + guide)
        notes = [
            f"Top oligo (5'→3'): {fwd_oligo}",
            f"Bottom oligo (5'→3'): {rev_oligo}",
            "Anneal oligos, then ligate into BsaI-digested vector.",
            "G added to 5' if not present (U6 promoter requirement).",
        ]
    else:
        fwd_oligo = rec_site + "N" + overhang_5 + insert[:20]
        rev_oligo = rec_site + "N" + overhang_3 + reverse_complement(insert[-20:])
        notes = [
            f"Forward oligo: {fwd_oligo}",
            f"Reverse oligo: {rev_oligo}",
            f"Digest PCR product with {enzyme}, ligate into vector.",
        ]

    fwd_primer = Primer(
        name="GG_Fwd", sequence=insert[:20],
        tm=calculate_tm(insert[:20]), gc_percent=gc_content(insert[:20]),
        length=20, binding_region="0–20",
        overhang=rec_site + "N" + overhang_5,
        notes=f"Includes {enzyme} site + 5' overhang",
    )
    rev_primer = Primer(
        name="GG_Rev", sequence=reverse_complement(insert[-20:]),
        tm=calculate_tm(insert[-20:]), gc_percent=gc_content(insert[-20:]),
        length=20, binding_region=f"{len(insert)-20}–{len(insert)}",
        overhang=rec_site + "N" + overhang_3,
        notes=f"Includes {enzyme} site + 3' overhang",
    )

    construct = f"[{rec_site}]-{overhang_5}-{insert}-{overhang_3}-[{rec_site}]"
    annotations = [
        {"label": f"{enzyme} site", "start": 0, "end": len(rec_site), "color": "#f59e0b", "type": "enzyme"},
        {"label": "5' overhang", "start": len(rec_site), "end": len(rec_site) + 4, "color": "#10b981", "type": "overhang"},
        {"label": "Insert", "start": len(rec_site) + 4, "end": len(rec_site) + 4 + len(insert), "color": "#3b82f6", "type": "insert"},
        {"label": "3' overhang", "start": len(rec_site) + 4 + len(insert), "end": len(rec_site) + 8 + len(insert), "color": "#10b981", "type": "overhang"},
        {"label": f"{enzyme} site", "start": len(rec_site) + 8 + len(insert), "end": len(rec_site) * 2 + 8 + len(insert), "color": "#f59e0b", "type": "enzyme"},
    ]

    sites = find_restriction_sites(insert, [enzyme])
    warnings = []
    if sites:
        warnings.append(f"⚠ Internal {enzyme} site found at position {sites[0].position} — will cause incomplete digestion. Remove before cloning.")

    return CloningDesign(
        strategy="Golden Gate / MoClo",
        insert_sequence=insert,
        insert_length=len(insert),
        vector_suggestion=CRISPR_VECTORS["golden_gate"] if is_sgrna else COMMON_VECTORS["golden_gate"],
        primers=[fwd_primer, rev_primer],
        restriction_sites=find_restriction_sites(insert),
        construct_sequence=construct,
        construct_annotated=annotations,
        notes=notes,
        warnings=warnings,
        genbank_record=_make_genbank(insert, annotations, "GoldenGate_construct"),
        fasta_record=f">GoldenGate_insert\n{insert}\n",
    )


def design_gibson(
    insert: str,
    vector_sequence: str = "",
    overlap_bp: int = 20,
    vector_name: str = "pUC19",
) -> CloningDesign:
    """Gibson Assembly design — overlap primers."""
    # Use dummy vector ends if not provided
    if not vector_sequence:
        vector_5end = "ACGCGTCGACGAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTTGGCGTAATCATG"
        vector_3end = "CACCGGAATCGATCCGGGTTTTCCCAGTCACGACGTTGTAAAACGACGGCCAGTGCCAAGCTTGCATGCCTGCAGGTCGAC"
    else:
        vector_5end = vector_sequence[:overlap_bp]
        vector_3end = vector_sequence[-overlap_bp:]

    fwd_overhang = vector_5end[-overlap_bp:]
    rev_overhang = reverse_complement(vector_3end[:overlap_bp])

    fwd_bind = insert[:20]
    rev_bind = reverse_complement(insert[-20:])

    fwd_primer = Primer(
        name="Gibson_Fwd",
        sequence=fwd_bind,
        tm=calculate_tm(fwd_bind),
        gc_percent=gc_content(fwd_bind),
        length=20,
        binding_region="0–20 of insert",
        overhang=fwd_overhang,
        notes=f"Adds {overlap_bp} bp overlap with vector 5' end",
    )
    rev_primer = Primer(
        name="Gibson_Rev",
        sequence=rev_bind,
        tm=calculate_tm(rev_bind),
        gc_percent=gc_content(rev_bind),
        length=20,
        binding_region=f"{len(insert)-20}–{len(insert)} of insert (RC)",
        overhang=rev_overhang,
        notes=f"Adds {overlap_bp} bp overlap with vector 3' end",
    )

    construct = fwd_overhang + insert + reverse_complement(rev_overhang)
    annotations = [
        {"label": "5' overlap", "start": 0, "end": overlap_bp, "color": "#f59e0b", "type": "overlap"},
        {"label": "Insert", "start": overlap_bp, "end": overlap_bp + len(insert), "color": "#3b82f6", "type": "insert"},
        {"label": "3' overlap", "start": overlap_bp + len(insert), "end": overlap_bp * 2 + len(insert), "color": "#f59e0b", "type": "overlap"},
    ]

    notes = [
        f"Overlap length: {overlap_bp} bp (recommended: 15–30 bp)",
        f"Fwd full oligo (5'→3'): {fwd_overhang}{fwd_bind}",
        f"Rev full oligo (5'→3'): {rev_overhang}{rev_bind}",
        "PCR-amplify insert with these primers, then use NEB HiFi Assembly or Gibson Assembly Mix.",
        "Linearize vector by restriction digestion or inverse PCR.",
    ]

    tm_diff = abs(calculate_tm(fwd_bind) - calculate_tm(rev_bind))
    warnings = []
    if tm_diff > 5:
        warnings.append(f"⚠ Primer Tm mismatch: {tm_diff:.1f}°C — adjust annealing temperatures accordingly.")
    if len(insert) > 5000:
        warnings.append("⚠ Long insert (>5 kb) — Gibson efficiency drops. Consider In-Fusion or SLIC alternatives.")

    return CloningDesign(
        strategy="Gibson Assembly",
        insert_sequence=insert,
        insert_length=len(insert),
        vector_suggestion=COMMON_VECTORS["gibson"],
        primers=[fwd_primer, rev_primer],
        restriction_sites=find_restriction_sites(insert),
        construct_sequence=construct,
        construct_annotated=annotations,
        notes=notes,
        warnings=warnings,
        genbank_record=_make_genbank(insert, annotations, "Gibson_construct"),
        fasta_record=f">Gibson_insert\n{insert}\n",
    )


def design_re_ligation(
    insert: str,
    enzyme_5: str = "EcoRI",
    enzyme_3: str = "BamHI",
    add_kozak: bool = False,
    add_stop: bool = True,
) -> CloningDesign:
    """Traditional restriction enzyme + T4 ligation design."""
    enz5 = RESTRICTION_ENZYMES[enzyme_5]
    enz3 = RESTRICTION_ENZYMES[enzyme_3]

    fwd_overhang = "GAATTC" if enzyme_5 == "EcoRI" else enz5["pattern"]
    rev_overhang = reverse_complement(enz3["pattern"])

    kozak = "GCCACCATG" if add_kozak else ""
    stop  = "TAA" if add_stop else ""

    fwd_primer = Primer(
        name=f"RE_Fwd_{enzyme_5}",
        sequence=insert[:20],
        tm=calculate_tm(insert[:20]),
        gc_percent=gc_content(insert[:20]),
        length=20,
        binding_region="0–20 of insert",
        overhang="AAAA" + enz5["pattern"] + kozak,
        notes=f"Adds {enzyme_5} site; Kozak={'yes' if kozak else 'no'}",
    )
    rev_primer = Primer(
        name=f"RE_Rev_{enzyme_3}",
        sequence=reverse_complement(insert[-20:]),
        tm=calculate_tm(insert[-20:]),
        gc_percent=gc_content(insert[-20:]),
        length=20,
        binding_region=f"{len(insert)-20}–{len(insert)} (RC)",
        overhang="AAAA" + enz3["pattern"] + (reverse_complement(stop) if stop else ""),
        notes=f"Adds {enzyme_3} site; stop codon={'yes' if stop else 'no'}",
    )

    construct = fwd_overhang + kozak + insert + stop + rev_overhang
    annotations = [
        {"label": enzyme_5, "start": 0, "end": len(fwd_overhang), "color": "#ef4444", "type": "enzyme"},
    ]
    offset = len(fwd_overhang)
    if kozak:
        annotations.append({"label": "Kozak", "start": offset, "end": offset + len(kozak), "color": "#a855f7", "type": "feature"})
        offset += len(kozak)
    annotations.append({"label": "Insert", "start": offset, "end": offset + len(insert), "color": "#3b82f6", "type": "insert"})
    offset += len(insert)
    if stop:
        annotations.append({"label": "Stop", "start": offset, "end": offset + len(stop), "color": "#f97316", "type": "feature"})
        offset += len(stop)
    annotations.append({"label": enzyme_3, "start": offset, "end": offset + len(rev_overhang), "color": "#ef4444", "type": "enzyme"})

    # Check for internal sites
    internal_5 = find_restriction_sites(insert, [enzyme_5])
    internal_3 = find_restriction_sites(insert, [enzyme_3])
    warnings = []
    if internal_5:
        warnings.append(f"⚠ Internal {enzyme_5} site in insert at pos {internal_5[0].position} — will cut insert. Choose different enzyme.")
    if internal_3:
        warnings.append(f"⚠ Internal {enzyme_3} site in insert at pos {internal_3[0].position} — will cut insert. Choose different enzyme.")

    notes = [
        f"Digest insert PCR product with {enzyme_5} + {enzyme_3}.",
        f"Digest vector with same enzymes (directional cloning).",
        "Gel-purify both insert and linearized vector.",
        "Ligate at 16°C overnight with T4 DNA Ligase.",
        "Screen colonies by colony PCR using vector-flanking primers.",
    ]

    return CloningDesign(
        strategy="Traditional RE-Ligation",
        insert_sequence=insert,
        insert_length=len(insert),
        vector_suggestion=COMMON_VECTORS["re_ligation"],
        primers=[fwd_primer, rev_primer],
        restriction_sites=find_restriction_sites(insert),
        construct_sequence=construct,
        construct_annotated=annotations,
        notes=notes,
        warnings=warnings,
        genbank_record=_make_genbank(insert, annotations, "RE_Ligation_construct"),
        fasta_record=f">RE_Ligation_insert\n{insert}\n",
    )


def design_gateway(
    insert: str,
    destination_vector: str = "pB7WG2",
    reading_frame_check: bool = True,
) -> CloningDesign:
    """Gateway BP/LR recombination design."""
    attB1 = RESTRICTION_ENZYMES["attB1"]["pattern"]
    attB2 = RESTRICTION_ENZYMES["attB2"]["pattern"]

    fwd_primer = Primer(
        name="GW_attB1_Fwd",
        sequence=insert[:20],
        tm=calculate_tm(insert[:20]),
        gc_percent=gc_content(insert[:20]),
        length=20,
        binding_region="0–20 of insert",
        overhang="GGGG" + attB1,
        notes="attB1 site for BP reaction into pDONR",
    )
    rev_primer = Primer(
        name="GW_attB2_Rev",
        sequence=reverse_complement(insert[-20:]),
        tm=calculate_tm(insert[-20:]),
        gc_percent=gc_content(insert[-20:]),
        length=20,
        binding_region=f"{len(insert)-20}–{len(insert)} (RC)",
        overhang="GGGG" + attB2,
        notes="attB2 site for BP reaction into pDONR",
    )

    construct = attB1 + insert + attB2
    annotations = [
        {"label": "attB1", "start": 0, "end": len(attB1), "color": "#8b5cf6", "type": "att"},
        {"label": "Insert (GOI)", "start": len(attB1), "end": len(attB1) + len(insert), "color": "#3b82f6", "type": "insert"},
        {"label": "attB2", "start": len(attB1) + len(insert), "end": len(attB1) + len(insert) + len(attB2), "color": "#8b5cf6", "type": "att"},
    ]

    warnings = []
    if reading_frame_check:
        # Check for in-frame stop codons (basic check)
        codons = [insert[i:i+3] for i in range(0, len(insert)-2, 3)]
        stops = [i*3 for i, c in enumerate(codons) if c.upper() in ("TAA","TAG","TGA")]
        if stops and stops[-1] < len(insert) - 3:
            warnings.append(f"⚠ Internal stop codon at nt {stops[0]} — check reading frame if expressing protein.")

    notes = [
        "Step 1 — BP Reaction: PCR product (attB1-insert-attB2) + pDONR207 + BP Clonase II → entry clone.",
        "Step 2 — Verify entry clone by sequencing.",
        "Step 3 — LR Reaction: entry clone + destination vector + LR Clonase II → expression clone.",
        f"Recommended destination vector: {destination_vector}",
        "Select on appropriate antibiotic (entry clone: Km; expression clone: vector-specific).",
        "Use ccdB negative selection for background reduction.",
    ]

    return CloningDesign(
        strategy="Gateway Recombination",
        insert_sequence=insert,
        insert_length=len(insert),
        vector_suggestion=COMMON_VECTORS["gateway"],
        primers=[fwd_primer, rev_primer],
        restriction_sites=find_restriction_sites(insert),
        construct_sequence=construct,
        construct_annotated=annotations,
        notes=notes,
        warnings=warnings,
        genbank_record=_make_genbank(insert, annotations, "Gateway_construct"),
        fasta_record=f">Gateway_insert_attB\n{construct}\n",
    )


# ─────────────────────────────────────────────
# Output Generators
# ─────────────────────────────────────────────

def _make_genbank(insert: str, annotations: list[dict], name: str) -> str:
    """Minimal GenBank-format record."""
    length = len(insert)
    header = (
        f"LOCUS       {name[:16]:<16} {length:>6} bp    DNA     linear   SYN 01-JAN-2025\n"
        f"DEFINITION  BioNexus cloning construct.\n"
        f"ACCESSION   .\n"
        f"FEATURES             Location/Qualifiers\n"
    )
    features = ""
    for ann in annotations:
        ftype = ann.get("type", "misc_feature")
        gb_type = {
            "insert": "CDS", "enzyme": "misc_feature",
            "overhang": "misc_feature", "att": "misc_recomb",
            "feature": "regulatory", "overlap": "misc_feature",
        }.get(ftype, "misc_feature")
        features += (
            f"     {gb_type:<16} {ann['start']+1}..{ann['end']}\n"
            f"                     /label=\"{ann['label']}\"\n"
            f"                     /note=\"BioNexus annotated\"\n"
        )
    origin = "ORIGIN\n"
    for i in range(0, len(insert), 60):
        chunk = insert[i:i+60].lower()
        spaced = " ".join(chunk[j:j+10] for j in range(0, len(chunk), 10))
        origin += f"      {i+1:>6} {spaced}\n"
    origin += "//\n"
    return header + features + origin


def run_cloning_design(
    insert: str,
    strategy: str,
    params: dict,
) -> dict:
    """Main dispatcher. Returns serialisable dict."""
    insert = insert.upper().replace(" ", "").replace("\n", "")
    if not re.match(r"^[ATGCNRYWSMKHBVD]+$", insert):
        return {"error": "Invalid nucleotide sequence. Only IUPAC DNA characters allowed."}
    if len(insert) < 10:
        return {"error": "Insert too short (< 10 bp)."}

    if strategy == CloningStrategy.GOLDEN_GATE:
        result = design_golden_gate(
            insert,
            vector=params.get("vector", "pHSE401 (Arabidopsis)"),
            enzyme=params.get("enzyme", "BsaI"),
            overhang_5=params.get("overhang_5", "AACG"),
            overhang_3=params.get("overhang_3", "AAAC"),
            is_sgrna=params.get("is_sgrna", False),
        )
    elif strategy == CloningStrategy.GIBSON:
        result = design_gibson(
            insert,
            vector_sequence=params.get("vector_sequence", ""),
            overlap_bp=int(params.get("overlap_bp", 20)),
            vector_name=params.get("vector_name", "pUC19"),
        )
    elif strategy == CloningStrategy.RE_LIGATION:
        result = design_re_ligation(
            insert,
            enzyme_5=params.get("enzyme_5", "EcoRI"),
            enzyme_3=params.get("enzyme_3", "BamHI"),
            add_kozak=params.get("add_kozak", False),
            add_stop=params.get("add_stop", True),
        )
    elif strategy == CloningStrategy.GATEWAY:
        result = design_gateway(
            insert,
            destination_vector=params.get("destination_vector", "pB7WG2"),
            reading_frame_check=params.get("reading_frame_check", True),
        )
    else:
        return {"error": f"Unknown strategy: {strategy}"}

    # Serialize
    return {
        "strategy": result.strategy,
        "insert_length": result.insert_length,
        "vector_suggestions": result.vector_suggestion,
        "primers": [
            {
                "name": p.name,
                "binding_sequence": p.sequence,
                "overhang": p.overhang,
                "full_sequence": p.full_sequence(),
                "tm_celsius": round(p.tm, 1),
                "gc_percent": p.gc_percent,
                "total_length": len(p.full_sequence()),
                "binding_region": p.binding_region,
                "notes": p.notes,
            }
            for p in result.primers
        ],
        "restriction_sites_in_insert": [
            {
                "enzyme": s.enzyme,
                "position": s.position,
                "strand": s.strand,
                "sequence": s.sequence,
                "overhang_type": s.overhang_type,
                "overhang_seq": s.overhang_seq,
            }
            for s in result.restriction_sites
        ],
        "construct_sequence": result.construct_sequence,
        "construct_annotations": result.construct_annotated,
        "protocol_notes": result.notes,
        "warnings": result.warnings,
        "downloads": {
            "genbank": result.genbank_record,
            "fasta": result.fasta_record,
        },
    }
