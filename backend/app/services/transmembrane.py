"""Module: Transmembrane + signal peptide orchestration and rendering.

The prediction itself is entirely EBI Phobius's (live) - see
phobius_remote.py. This file only renders what Phobius returned.
"""
from __future__ import annotations
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from matplotlib.lines import Line2D

from app.core.logging import logger
from app.services.phobius_remote import run_phobius, EXAMPLE_SEQUENCE

_REGION_COLORS = {"SIGNAL": "#e3b23c", "TRANSMEM": "#c4667a"}


def render_topology(seq_id: str, seq_len: int, regions: list[dict] | None,
                    tm_count: int, has_sp: bool, out_dir: Path) -> dict:
    """Render a publication-quality topology diagram. Uses exact residue
    boundaries when Phobius's long-format output parsed successfully;
    otherwise draws an explicitly-labeled schematic with evenly spaced
    TM boxes sized from the sequence length and the short-format TM
    count, so the figure never silently implies precision it doesn't have.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(12, 2.4), dpi=200)

    ax.add_patch(Rectangle((0, -0.05), seq_len, 0.1,
                           facecolor="#dddddd", edgecolor="black", lw=0.5))

    exact = bool(regions)
    if exact:
        for r in regions:
            color = _REGION_COLORS.get(r["kind"])
            if not color:
                continue
            s, e = r["start"], r["end"]
            ax.add_patch(Rectangle((s, -0.25), e - s, 0.5,
                                   facecolor=color, edgecolor="black", lw=0.5, alpha=0.9))
    else:
        # schematic: evenly spaced boxes, sized to be visible, explicitly
        # not claiming exact residue boundaries
        if has_sp:
            ax.add_patch(Rectangle((0, -0.25), max(seq_len * 0.05, 5), 0.5,
                                   facecolor=_REGION_COLORS["SIGNAL"],
                                   edgecolor="black", lw=0.5, alpha=0.9))
        if tm_count:
            usable_start = seq_len * 0.12
            usable_len = seq_len * 0.82
            box_w = usable_len / (tm_count * 1.6)
            gap = box_w * 0.6
            x = usable_start
            for _ in range(tm_count):
                ax.add_patch(Rectangle((x, -0.25), box_w, 0.5,
                                       facecolor=_REGION_COLORS["TRANSMEM"],
                                       edgecolor="black", lw=0.5, alpha=0.9))
                x += box_w + gap

    ax.set_xlim(-seq_len * 0.02, seq_len * 1.02)
    ax.set_ylim(-0.6, 0.6)
    ax.set_yticks([])
    ax.set_xlabel("Position (aa)", fontsize=9)
    subtitle = "exact boundaries (Phobius long format)" if exact else \
        "schematic - TM count from Phobius, positions not to scale"
    ax.set_title(f"{seq_id}: {tm_count} TM helix/helices, "
                f"signal peptide {'present' if has_sp else 'absent'} ({subtitle})",
                fontsize=10, weight="bold", loc="left")
    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)

    legend_handles = [
        Line2D([0], [0], marker="s", color="w", markerfacecolor=_REGION_COLORS["SIGNAL"],
               markersize=10, label="Signal peptide"),
        Line2D([0], [0], marker="s", color="w", markerfacecolor=_REGION_COLORS["TRANSMEM"],
               markersize=10, label="Transmembrane helix"),
    ]
    ax.legend(handles=legend_handles, loc="upper center", bbox_to_anchor=(0.5, -0.35),
              ncol=2, frameon=False, fontsize=8)

    plt.tight_layout()
    png_path = out_dir / f"{seq_id}_topology.png"
    svg_path = out_dir / f"{seq_id}_topology.svg"
    pdf_path = out_dir / f"{seq_id}_topology.pdf"
    fig.savefig(png_path, dpi=300, bbox_inches="tight")
    fig.savefig(svg_path, bbox_inches="tight")
    fig.savefig(pdf_path, bbox_inches="tight")
    plt.close(fig)
    return {"png": str(png_path), "svg": str(svg_path), "pdf": str(pdf_path)}


def run_transmembrane_prediction(sequences: list[tuple[str, str]], job_dir: Path,
                                 on_progress=None) -> dict:
    fasta_text = "\n".join(f">{sid}\n{seq}" for sid, seq in sequences)
    seq_lengths = {sid: len(seq) for sid, seq in sequences}

    phobius = run_phobius(fasta_text, on_progress=on_progress)
    summary = phobius["summary"]
    regions = phobius["regions"]

    viz_dir = job_dir / "viz"
    images: dict[str, dict] = {}
    summary_rows = []
    errors: list[str] = []

    for seq_id, seq_len in seq_lengths.items():
        s = summary.get(seq_id)
        if not s:
            errors.append(f"No Phobius result returned for '{seq_id}'")
            continue
        summary_rows.append({
            "sequence_id": seq_id, "length": seq_len,
            "tm_count": s["tm_count"], "has_signal_peptide": s["has_signal_peptide"],
            "prediction_string": s["prediction_string"],
        })
        try:
            images[seq_id] = render_topology(
                seq_id, seq_len, regions.get(seq_id), s["tm_count"],
                s["has_signal_peptide"], viz_dir,
            )
        except Exception as e:
            msg = f"Topology rendering failed for '{seq_id}': {e}"
            logger.warning(msg)
            errors.append(msg)

    (job_dir / "phobius_results.json").write_text(json.dumps({
        "summary": summary, "regions": regions,
    }, indent=2))

    summary_csv = job_dir / "transmembrane_summary.csv"
    with summary_csv.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "sequence_id", "length", "tm_count", "has_signal_peptide", "prediction_string",
        ])
        w.writeheader()
        w.writerows(summary_rows)

    return {
        "method": "EBI Phobius (live) - Käll, Krogh & Sonnhammer (2004), J Mol Biol 338:1027-1036",
        "sequences": summary_rows,
        "results": summary,
        "regions": regions,
        "images": images,
        "files": {
            "json": str(job_dir / "phobius_results.json"),
            "summary_csv": str(summary_csv),
        },
        "errors": errors,
    }
