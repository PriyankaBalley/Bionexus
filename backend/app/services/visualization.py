"""Module 3: TBtools-style promoter map visualization.

Generates:
  * High-resolution PNG and SVG via matplotlib (publication-quality)
  * Interactive Plotly HTML for in-browser exploration
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Iterable

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrow
from matplotlib.lines import Line2D
import plotly.graph_objects as go

from app.core.logging import logger


# Stable color palette for elements
def _color_for(name: str) -> str:
    palette = [
        "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
        "#ffff33", "#a65628", "#f781bf", "#66c2a5", "#fc8d62",
        "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494",
        "#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e",
    ]
    return palette[hash(name) % len(palette)]


def render_promoter_map(seq_id: str, seq_length: int, hits: list[dict],
                        out_dir: Path, title: str | None = None) -> dict:
    """Render publication-quality figure (PNG + SVG) and an interactive HTML."""
    out_dir.mkdir(parents=True, exist_ok=True)
    title = title or f"Cis-regulatory element map: {seq_id}"

    # ── Static (matplotlib) ──────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(14, 4.5), dpi=200)

    # Sequence baseline
    ax.add_patch(Rectangle((0, -0.05), seq_length, 0.1,
                           facecolor="#cccccc", edgecolor="black", lw=0.5))

    # TSS arrow at right end (downstream)
    ax.annotate(
        "TSS", xy=(seq_length, 0), xytext=(seq_length - seq_length * 0.05, 0.6),
        arrowprops=dict(arrowstyle="->", lw=1.5, color="black"),
        fontsize=10, ha="center",
    )

    # Stagger overlapping elements into rows
    rows: list[list[tuple[int, int]]] = []
    placed = []
    for h in sorted(hits, key=lambda x: x["start"]):
        s, e = h["start"], h["end"]
        row_idx = 0
        while True:
            if row_idx >= len(rows):
                rows.append([])
            if all(e < rs or s > re for rs, re in rows[row_idx]):
                rows[row_idx].append((s, e))
                placed.append((h, row_idx))
                break
            row_idx += 1

    n_rows = max(len(rows), 1)
    row_height = 0.25
    row_gap = 0.08

    # A local-library scan has a bounded vocabulary (~40 named elements), but
    # live PlantPAN TFBS hits are keyed by "TF Family" strings that combine
    # multiple family names (e.g. "MYB;Myb/SANT;Tryptophan cluster
    # factors;MYB-related") and can easily produce 100+ distinct labels for a
    # single sequence. Every hit still gets drawn in its own color below, but
    # the legend itself is capped to the most frequent names so it stays
    # readable instead of dwarfing the actual map.
    MAX_LEGEND = 25
    name_counts: dict[str, int] = {}
    for h, _row in placed:
        name_counts[h["name"]] = name_counts.get(h["name"], 0) + 1
    legend_names = {
        n for n, _ in sorted(name_counts.items(), key=lambda kv: -kv[1])[:MAX_LEGEND]
    }

    seen_legend: set[str] = set()
    legend_handles: list[Line2D] = []

    for h, row in placed:
        s, e = h["start"], h["end"]
        y = 0.25 + row * (row_height + row_gap)
        if h["strand"] == "-":
            y = -y - row_height
        color = _color_for(h["name"])

        ax.add_patch(Rectangle((s, y), max(e - s, seq_length * 0.002),
                               row_height, facecolor=color, edgecolor="black",
                               lw=0.4, alpha=0.92))

        if h["name"] in legend_names and h["name"] not in seen_legend:
            seen_legend.add(h["name"])
            legend_handles.append(
                Line2D([0], [0], marker="s", color="w", markerfacecolor=color,
                       markersize=10, label=h["name"])
            )

    n_omitted = len(name_counts) - len(legend_handles)
    if n_omitted > 0:
        legend_handles.append(
            Line2D([0], [0], marker="", color="none",
                   label=f"+{n_omitted} more element type(s) — see CSV / interactive HTML")
        )

    # Axes formatting
    y_top = 0.25 + n_rows * (row_height + row_gap) + 0.2
    y_bot = -y_top
    ax.set_xlim(-seq_length * 0.02, seq_length * 1.02)
    ax.set_ylim(y_bot, y_top)
    ax.set_xlabel("Position (bp)", fontsize=11)
    ax.set_yticks([])
    ax.set_title(title, fontsize=12, weight="bold")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)

    # Strand labels
    ax.text(-seq_length * 0.015, y_top * 0.5, "+", fontsize=14, weight="bold",
            ha="center", va="center")
    ax.text(-seq_length * 0.015, y_bot * 0.5, "−", fontsize=14, weight="bold",
            ha="center", va="center")

    if legend_handles:
        ax.legend(handles=legend_handles, loc="center left",
                  bbox_to_anchor=(1.01, 0.5), fontsize=8, frameon=False,
                  ncol=1 if len(legend_handles) <= 25 else 2)

    plt.tight_layout()
    png_path = out_dir / f"{seq_id}_map.png"
    svg_path = out_dir / f"{seq_id}_map.svg"
    pdf_path = out_dir / f"{seq_id}_map.pdf"
    fig.savefig(png_path, dpi=300, bbox_inches="tight")
    fig.savefig(svg_path, bbox_inches="tight")
    fig.savefig(pdf_path, bbox_inches="tight")
    plt.close(fig)

    # ── Interactive (plotly) ──────────────────────────────────────────────
    pfig = go.Figure()
    pfig.add_shape(type="rect", x0=0, x1=seq_length, y0=-0.05, y1=0.05,
                   fillcolor="#cccccc", line=dict(color="black", width=0.5))

    by_name: dict[str, list[dict]] = {}
    for h, row in placed:
        by_name.setdefault(h["name"], []).append({**h, "_row": row})

    for name, group in by_name.items():
        xs, ys, texts = [], [], []
        for h in group:
            s, e = h["start"], h["end"]
            row_y = 0.25 + h["_row"] * (row_height + row_gap)
            if h["strand"] == "-":
                row_y = -row_y - row_height
            mid = (s + e) / 2
            xs.append(mid)
            ys.append(row_y + row_height / 2)
            texts.append(
                f"<b>{h['name']}</b><br>{h['sequence']}<br>"
                f"{s}-{e} ({h['strand']})<br>"
                f"score={h['score']}<br>{h['description']}"
            )
        pfig.add_trace(go.Scatter(
            x=xs, y=ys, mode="markers", name=name,
            marker=dict(size=12, color=_color_for(name),
                        line=dict(width=0.5, color="black")),
            hovertext=texts, hoverinfo="text",
        ))

    pfig.update_layout(
        title=title,
        xaxis_title="Position (bp)",
        yaxis=dict(visible=False, range=[y_bot, y_top]),
        height=480, width=1200,
        plot_bgcolor="white",
        legend=dict(itemsizing="constant"),
    )
    html_path = out_dir / f"{seq_id}_map.html"
    pfig.write_html(html_path, include_plotlyjs=True)

    logger.info(f"Visualization rendered for {seq_id}: {len(hits)} elements")

    return {
        "png": str(png_path),
        "svg": str(svg_path),
        "pdf": str(pdf_path),
        "html": str(html_path),
    }


def render_all(promoter_results: dict, fasta_path: Path, out_dir: Path) -> dict[str, dict]:
    """Render visualizations for every sequence in the promoter analysis output.

    Must resolve each result's id to its sequence length using the exact
    same disambiguation as analyze_promoter (see disambiguate_records) -
    building a separate plain id->record dict here previously collapsed
    duplicate FASTA headers differently than the promoter scan did, which
    silently dropped the visualization for every repeated id past the first
    occurrence and mismatched sequence length for the one that "survived".
    """
    from Bio import SeqIO
    from app.services.promoter import disambiguate_records
    records = list(SeqIO.parse(str(fasta_path), "fasta"))
    id_to_length = {uid: len(rec.seq) for uid, rec in disambiguate_records(records)}
    output = {}
    for seq_id, hits in promoter_results.items():
        if seq_id not in id_to_length:
            continue
        out = render_promoter_map(seq_id, id_to_length[seq_id], hits, out_dir)
        output[seq_id] = out
    return output
