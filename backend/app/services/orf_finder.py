"""Module: Open Reading Frame (ORF) prediction.

Scans all 6 reading frames (3 forward, 3 reverse-complement) for
ATG...stop ORFs, following the same approach as NCBI ORFfinder and
EMBOSS getorf. The standard genetic code table (translation + stop
codons) comes from Biopython's Bio.Data.CodonTable rather than a
hand-typed table, so it can't silently drift from the real NCBI
translation table 1.
"""
from __future__ import annotations
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrow
from matplotlib.lines import Line2D

from Bio.Data import CodonTable
from Bio.Seq import Seq

from app.core.logging import logger

_TABLE = CodonTable.unambiguous_dna_by_id[1]
_STOP_CODONS = set(_TABLE.stop_codons)
_FRAME_COLORS = {1: "#2b9186", 2: "#e3b23c", 3: "#5aa9c9",
                 -1: "#c4667a", -2: "#8a6fb0", -3: "#7f9e5a"}

# Real AT1G01010 (Arabidopsis thaliana NAC001) CDS, fetched live from
# Ensembl Plants (rest.ensembl.org/sequence/id/AT1G01010.1?type=cds) -
# not a hand-typed placeholder. 1290 bp, verified to start with ATG and
# end on an in-frame stop codon.
EXAMPLE_SEQUENCE = (
    ">AT1G01010_CDS\n"
    "ATGGAGGATCAAGTTGGGTTTGGGTTCCGTCCGAACGACGAGGAGCTCGTTGGTCACTAT\n"
    "CTCCGTAACAAAATCGAAGGAAACACTAGCCGCGACGTTGAAGTAGCCATCAGCGAGGTC\n"
    "AACATCTGTAGCTACGATCCTTGGAACTTGCGCTTCCAGTCAAAGTACAAATCGAGAGAT\n"
    "GCTATGTGGTACTTCTTCTCTCGTAGAGAAAACAACAAAGGGAATCGACAGAGCAGGACA\n"
    "ACGGTTTCTGGTAAATGGAAGCTTACCGGAGAATCTGTTGAGGTCAAGGACCAGTGGGGA\n"
    "TTTTGTAGTGAGGGCTTTCGTGGTAAGATTGGTCATAAAAGGGTTTTGGTGTTCCTCGAT\n"
    "GGAAGATACCCTGACAAAACCAAATCTGATTGGGTTATCCACGAGTTCCACTACGACCTC\n"
    "TTACCAGAACATCAGAGGACATATGTCATCTGCAGACTTGAGTACAAGGGTGATGATGCG\n"
    "GACATTCTATCTGCTTATGCAATAGATCCCACTCCCGCTTTTGTCCCCAATATGACTAGT\n"
    "AGTGCAGGTTCTGTGGTCAACCAATCACGTCAACGAAATTCAGGATCTTACAACACTTAC\n"
    "TCTGAGTATGATTCAGCAAATCATGGCCAGCAGTTTAATGAAAACTCTAACATTATGCAG\n"
    "CAGCAACCACTTCAAGGATCATTCAACCCTCTCCTTGAGTATGATTTTGCAAATCACGGC\n"
    "GGTCAGTGGCTGAGTGACTATATCGACCTGCAACAGCAAGTTCCTTACTTGGCACCTTAT\n"
    "GAAAATGAGTCGGAGATGATTTGGAAGCATGTGATTGAAGAAAATTTTGAGTTTTTGGTA\n"
    "GATGAAAGGACATCTATGCAACAGCATTACAGTGATCACCGGCCCAAAAAACCTGTGTCT\n"
    "GGGGTTTTGCCTGATGATAGCAGTGATACTGAAACTGGATCAATGATTTTCGAAGACACT\n"
    "TCGAGCTCCACTGATAGTGTTGGTAGTTCAGATGAACCGGGCCATACTCGTATAGATGAT\n"
    "ATTCCATCATTGAACATTATTGAGCCTTTGCACAATTATAAGGCACAAGAGCAACCAAAG\n"
    "CAGCAGAGCAAAGAAAAGGTGATAAGTTCGCAGAAAAGCGAATGCGAGTGGAAAATGGCT\n"
    "GAAGACTCGATCAAGATACCTCCATCCACCAACACGGTGAAGCAGAGCTGGATTGTTTTG\n"
    "GAGAATGCACAGTGGAACTATCTCAAGAACATGATCATTGGTGTCTTGTTGTTCATCTCC\n"
    "GTCATTAGTTGGATCATTCTTGTTGGTTAA\n"
)


def reverse_complement(seq: str) -> str:
    return str(Seq(seq).reverse_complement())


def _scan_frame(seq: str, frame_offset: int, strand: int, seq_len: int,
                min_aa: int, require_atg: bool) -> list[dict]:
    """Scan one reading frame (0/1/2 offset) for ATG...stop ORFs."""
    orfs = []
    i = frame_offset
    open_start = None
    while i + 3 <= len(seq):
        codon = seq[i:i + 3]
        is_start = codon == "ATG" if require_atg else (open_start is None)
        if open_start is None and is_start:
            open_start = i
        elif open_start is not None and codon in _STOP_CODONS:
            orf_nt = seq[open_start:i + 3]
            aa_len = (i - open_start) // 3
            if aa_len >= min_aa:
                protein = str(Seq(orf_nt).translate(table=1, to_stop=True))
                if strand == 1:
                    nt_start, nt_end = open_start + 1, i + 3
                else:
                    nt_start = seq_len - (i + 3) + 1
                    nt_end = seq_len - open_start
                orfs.append({
                    "strand": strand, "frame": frame_offset + 1 if strand == 1
                              else -(frame_offset + 1),
                    "nt_start": nt_start, "nt_end": nt_end,
                    "nt_length": i + 3 - open_start,
                    "aa_length": aa_len,
                    "protein": protein,
                })
            open_start = None
        i += 3
    return orfs


def find_orfs(seq: str, min_aa: int = 25, require_atg: bool = True) -> list[dict]:
    """Find ORFs in all 6 reading frames. min_aa is the minimum protein
    length (excluding the stop codon) to report, following NCBI
    ORFfinder's convention of filtering by translated length.
    """
    seq = seq.upper().replace("U", "T")
    seq_len = len(seq)
    rc = reverse_complement(seq)

    orfs = []
    for offset in range(3):
        orfs.extend(_scan_frame(seq, offset, 1, seq_len, min_aa, require_atg))
    for offset in range(3):
        orfs.extend(_scan_frame(rc, offset, -1, seq_len, min_aa, require_atg))

    orfs.sort(key=lambda o: (-o["aa_length"], o["nt_start"]))
    for i, o in enumerate(orfs, start=1):
        o["rank"] = i
    return orfs


def render_orf_map(seq_id: str, seq_len: int, orfs: list[dict], out_dir: Path) -> dict:
    """Render a publication-quality linear ORF map (gene-map style arrows,
    one row per frame), matching the visualization conventions used
    elsewhere in this app (Agg backend, 300 dpi PNG + SVG + PDF).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(14, 4), dpi=200)

    ax.add_patch(plt.Rectangle((0, -0.04), seq_len, 0.08,
                               facecolor="#dddddd", edgecolor="black", lw=0.5))

    frames_order = [3, 2, 1, -1, -2, -3]
    row_y = {f: (3 - i if f > 0 else -(i - 2)) * 0.6 for i, f in enumerate(frames_order)}

    for o in orfs:
        y = row_y[o["frame"]]
        color = _FRAME_COLORS[o["frame"]]
        s, e = o["nt_start"] - 1, o["nt_end"]
        width = e - s
        direction = 1 if o["strand"] == 1 else -1
        head = min(width * 0.15, seq_len * 0.01)
        ax.add_patch(FancyArrow(
            s if direction == 1 else e, y, (width - head) * direction, 0,
            width=0.35, head_width=0.5, head_length=head,
            length_includes_head=True, facecolor=color, edgecolor="black", lw=0.4,
        ))

    for f, y in row_y.items():
        ax.text(-seq_len * 0.02, y, f"{'+' if f > 0 else ''}{f}", fontsize=8,
                ha="right", va="center", color="#555555")

    ax.set_xlim(-seq_len * 0.06, seq_len * 1.02)
    ax.set_ylim(-2.1, 2.1)
    ax.set_yticks([])
    ax.set_xlabel("Position (nt)", fontsize=10)
    ax.set_title(f"ORF map: {seq_id} ({seq_len} nt, {len(orfs)} ORFs ≥ threshold)",
                fontsize=12, weight="bold")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)

    legend_handles = [
        Line2D([0], [0], marker=">", color="w", markerfacecolor=c, markersize=10,
               label=f"Frame {'+' if f > 0 else ''}{f}")
        for f, c in _FRAME_COLORS.items()
    ]
    ax.legend(handles=legend_handles, loc="upper center", bbox_to_anchor=(0.5, -0.15),
              ncol=6, frameon=False, fontsize=8)

    plt.tight_layout()
    png_path = out_dir / f"{seq_id}_orfmap.png"
    svg_path = out_dir / f"{seq_id}_orfmap.svg"
    pdf_path = out_dir / f"{seq_id}_orfmap.pdf"
    fig.savefig(png_path, dpi=300, bbox_inches="tight")
    fig.savefig(svg_path, bbox_inches="tight")
    fig.savefig(pdf_path, bbox_inches="tight")
    plt.close(fig)
    return {"png": str(png_path), "svg": str(svg_path), "pdf": str(pdf_path)}


def run_orf_prediction(sequences: list[tuple[str, str]], job_dir: Path,
                       min_aa: int = 25, require_atg: bool = True) -> dict:
    results: dict[str, list[dict]] = {}
    summary_rows = []
    images: dict[str, dict] = {}
    errors: list[str] = []
    viz_dir = job_dir / "viz"

    for seq_id, seq in sequences:
        try:
            orfs = find_orfs(seq, min_aa=min_aa, require_atg=require_atg)
        except Exception as e:
            msg = f"ORF prediction failed for '{seq_id}': {e}"
            logger.warning(msg)
            errors.append(msg)
            continue
        results[seq_id] = orfs
        summary_rows.append({
            "sequence_id": seq_id, "length": len(seq), "orf_count": len(orfs),
            "longest_orf_aa": orfs[0]["aa_length"] if orfs else 0,
        })
        logger.info(f"{seq_id}: {len(orfs)} ORFs found (min_aa={min_aa})")
        try:
            images[seq_id] = render_orf_map(seq_id, len(seq), orfs, viz_dir)
        except Exception as e:
            msg = f"ORF map rendering failed for '{seq_id}': {e}"
            logger.warning(msg)
            errors.append(msg)

    (job_dir / "orf_results.json").write_text(json.dumps(results, indent=2))

    orfs_csv = job_dir / "orf_predictions.csv"
    with orfs_csv.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sequence_id", "rank", "strand", "frame", "nt_start", "nt_end",
                    "nt_length", "aa_length", "protein"])
        for seq_id, orfs in results.items():
            for o in orfs:
                w.writerow([seq_id, o["rank"], o["strand"], o["frame"], o["nt_start"],
                            o["nt_end"], o["nt_length"], o["aa_length"], o["protein"]])

    fasta_path = job_dir / "orf_proteins.fasta"
    with fasta_path.open("w") as f:
        for seq_id, orfs in results.items():
            for o in orfs:
                f.write(f">{seq_id}_ORF{o['rank']}_{o['nt_start']}-{o['nt_end']}"
                       f"({'+' if o['strand'] == 1 else '-'})\n{o['protein']}\n")

    summary_csv = job_dir / "orf_summary.csv"
    with summary_csv.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["sequence_id", "length", "orf_count", "longest_orf_aa"])
        w.writeheader()
        w.writerows(summary_rows)

    return {
        "method": "6-frame ORF scan (NCBI ORFfinder / EMBOSS getorf convention)",
        "min_aa": min_aa, "require_atg": require_atg,
        "sequences": summary_rows,
        "results": results,
        "images": images,
        "files": {
            "json": str(job_dir / "orf_results.json"),
            "csv": str(orfs_csv),
            "fasta": str(fasta_path),
            "summary_csv": str(summary_csv),
        },
        "errors": errors,
    }
