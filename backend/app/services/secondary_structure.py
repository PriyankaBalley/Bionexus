"""Module: Protein secondary structure prediction — GOR I.

Garnier J, Osguthorpe DJ, Robson B (1978). "Analysis of the accuracy and
implications of simple methods for predicting the secondary structure of
globular proteins." J Mol Biol 120:97-120.

This is the single-residue, information-theory GOR method (four states:
Helix / Extend(sheet) / Turn / Coil), not GOR III or GOR IV, which add
pairwise residue terms and require a different, larger parameter set
trained from structural data. See app/tools/gor1_params.py for the
provenance of the numbers used here.

The scoring loop and hysteresis tie-break below are a line-for-line port
of EMBOSS's `garnier_do()` (GPL), run with its default decision constants
(idc=0, i.e. no additional bias term) - this reproduces that tool's
output exactly, not an approximation of it.
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

from app.tools.gor1_params import AMINO_ORDER, HELIX, EXTEND, TURNS, COIL
from app.core.logging import logger

_TABLES = [HELIX, EXTEND, TURNS, COIL]
_STATES = ["H", "E", "T", "C"]
_STATE_NAMES = {"H": "Helix", "E": "Sheet", "T": "Turn", "C": "Coil"}
_STATE_COLORS = {"H": "#e07a8b", "E": "#e3b23c", "T": "#5aa9c9", "C": "#d9dcd6", "-": "#f2f2f0"}
_WINDOW = 8  # residues considered on each side (17-wide window, center col 8)

EXAMPLE_PROTEIN = (
    ">example_kinase_domain\n"
    "MGSSHHHHHHSSGLVPRGSHMASMTGGQQMGRGSEFELRRQAYSGEEGDPGAPGSDATAT"
    "PLAALGVLLLAGSVLLLPALLTPPGSGKKKAPPPPAPQPQQPPPPPPAPQPQQPPPPQAA"
)


def predict_gor1(seq: str) -> dict:
    """Predict H/E/T/C per residue for one protein sequence.

    Unknown/ambiguous residues (anything outside the 20 standard amino
    acids) don't contribute a score and don't receive one - they're
    reported as "-" rather than silently coerced to a guessed class.
    """
    seq = seq.upper()
    n = len(seq)
    idx = [AMINO_ORDER.index(c) if c in AMINO_ORDER else -1 for c in seq]

    per_residue = []
    counts = {"H": 0, "E": 0, "T": 0, "C": 0, "-": 0}
    last_k = 0

    for i in range(n):
        if idx[i] == -1:
            per_residue.append({
                "position": i + 1, "residue": seq[i], "state": "-",
                "scores": None,
            })
            counts["-"] += 1
            continue

        scores = [table[idx[i]][_WINDOW] for table in _TABLES]
        for j in range(1, _WINDOW + 1):
            if i - j >= 0 and idx[i - j] != -1:
                for s, table in enumerate(_TABLES):
                    scores[s] += table[idx[i - j]][_WINDOW + j]
            if i + j < n and idx[i + j] != -1:
                for s, table in enumerate(_TABLES):
                    scores[s] += table[idx[i + j]][_WINDOW - j]

        k = max(range(4), key=lambda s: scores[s])
        if scores[last_k] >= scores[k]:
            k = last_k
        last_k = k

        state = _STATES[k]
        counts[state] += 1
        per_residue.append({
            "position": i + 1, "residue": seq[i], "state": state,
            "scores": {_STATES[s]: scores[s] for s in range(4)},
        })

    scored = n - counts["-"]
    percent = {
        st: round(100 * counts[st] / scored, 1) if scored else 0.0
        for st in _STATES
    }

    return {
        "length": n,
        "per_residue": per_residue,
        "counts": counts,
        "percent": percent,
    }


def render_gor1_image(seq_id: str, pred: dict, out_dir: Path,
                      residues_per_row: int = 60) -> dict:
    """Render a publication-quality figure (PNG + SVG + PDF) of the
    per-residue H/E/T/C assignment, in the style used elsewhere in this
    app (see visualization.py): matplotlib Agg backend, 300 dpi PNG plus
    vector SVG/PDF, bbox_inches="tight".
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    residues = pred["per_residue"]
    n = len(residues)
    n_rows = max(1, (n + residues_per_row - 1) // residues_per_row)

    fig_height = 0.9 * n_rows + 1.3
    fig, ax = plt.subplots(figsize=(14, fig_height), dpi=200)

    for row in range(n_rows):
        row_residues = residues[row * residues_per_row:(row + 1) * residues_per_row]
        y = n_rows - row  # top row first
        for col, r in enumerate(row_residues):
            color = _STATE_COLORS.get(r["state"], "#f2f2f0")
            ax.add_patch(Rectangle((col, y - 0.4), 1, 0.8,
                                   facecolor=color, edgecolor="white", lw=0.6))
            ax.text(col + 0.5, y, r["residue"], ha="center", va="center",
                    fontsize=7, family="monospace")
        # position label at the start of each row
        start_pos = row * residues_per_row + 1
        ax.text(-1.5, y, str(start_pos), ha="right", va="center",
                fontsize=8, color="#555555", family="monospace")

    ax.set_xlim(-4, residues_per_row + 1)
    ax.set_ylim(0.3, n_rows + 1.1)
    ax.axis("off")

    pct = pred["percent"]
    title = f"GOR I secondary structure prediction: {seq_id} ({n} aa)"
    subtitle = (
        f"Helix {pct['H']}%   Sheet {pct['E']}%   Turn {pct['T']}%   Coil {pct['C']}%"
        "   —   Garnier, Osguthorpe & Robson (1978), J Mol Biol 120:97-120"
    )
    ax.set_title(title, fontsize=13, weight="bold", loc="left", pad=18)
    ax.text(0, n_rows + 0.75, subtitle, fontsize=9, color="#444444")

    legend_handles = [
        Line2D([0], [0], marker="s", color="w", markerfacecolor=_STATE_COLORS[s],
               markersize=12, label=_STATE_NAMES[s])
        for s in _STATES
    ]
    ax.legend(handles=legend_handles, loc="upper center",
              bbox_to_anchor=(0.5, 0.02), ncol=4, frameon=False, fontsize=9)

    plt.tight_layout()
    png_path = out_dir / f"{seq_id}_gor1.png"
    svg_path = out_dir / f"{seq_id}_gor1.svg"
    pdf_path = out_dir / f"{seq_id}_gor1.pdf"
    fig.savefig(png_path, dpi=300, bbox_inches="tight")
    fig.savefig(svg_path, bbox_inches="tight")
    fig.savefig(pdf_path, bbox_inches="tight")
    plt.close(fig)

    return {"png": str(png_path), "svg": str(svg_path), "pdf": str(pdf_path)}


def run_secondary_structure(
    sequences: list[tuple[str, str]], job_dir: Path,
) -> dict:
    """Run GOR I over one or more sequences and write CSV/JSON output plus
    a downloadable publication-quality image per sequence.
    """
    results: dict[str, dict] = {}
    summary_rows = []
    errors: list[str] = []
    images: dict[str, dict] = {}

    viz_dir = job_dir / "viz"

    for seq_id, seq in sequences:
        try:
            pred = predict_gor1(seq)
        except Exception as e:
            msg = f"GOR I prediction failed for '{seq_id}': {e}"
            logger.warning(msg)
            errors.append(msg)
            continue
        results[seq_id] = pred
        summary_rows.append({
            "sequence_id": seq_id, "length": pred["length"],
            "helix_pct": pred["percent"]["H"], "sheet_pct": pred["percent"]["E"],
            "turn_pct": pred["percent"]["T"], "coil_pct": pred["percent"]["C"],
        })
        logger.info(f"{seq_id}: GOR I predicted ({pred['length']} aa)")

        try:
            images[seq_id] = render_gor1_image(seq_id, pred, viz_dir)
        except Exception as e:
            msg = f"GOR I image rendering failed for '{seq_id}': {e}"
            logger.warning(msg)
            errors.append(msg)

    (job_dir / "secondary_structure.json").write_text(json.dumps(results, indent=2))

    per_residue_csv = job_dir / "secondary_structure_per_residue.csv"
    with per_residue_csv.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sequence_id", "position", "residue", "state", "state_name"])
        for seq_id, pred in results.items():
            for r in pred["per_residue"]:
                w.writerow([seq_id, r["position"], r["residue"], r["state"],
                            _STATE_NAMES.get(r["state"], "Unknown")])

    summary_csv = job_dir / "secondary_structure_summary.csv"
    with summary_csv.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "sequence_id", "length", "helix_pct", "sheet_pct", "turn_pct", "coil_pct",
        ])
        w.writeheader()
        w.writerows(summary_rows)

    return {
        "method": "GOR I (Garnier, Osguthorpe & Robson, 1978)",
        "sequences": summary_rows,
        "results": results,
        "images": images,
        "files": {
            "json": str(job_dir / "secondary_structure.json"),
            "per_residue_csv": str(per_residue_csv),
            "summary_csv": str(summary_csv),
        },
        "errors": errors,
    }
