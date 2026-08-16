"""Module: Phylogeny orchestration + rendering.

The tree itself is built entirely by live EBI queries (Clustal Omega for
alignment, Simple Phylogeny for the neighbour-joining tree) - see
phylogeny_remote.py. This file only parses the returned Newick string
with Biopython's real Bio.Phylo parser and draws it, it does not
recompute or approximate the tree.
"""
from __future__ import annotations
import io
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from Bio import Phylo

from app.core.logging import logger
from app.services.phylogeny_remote import build_phylogeny, EXAMPLE_SEQUENCES


def render_tree(newick: str, out_dir: Path, title: str = "Phylogenetic tree") -> dict:
    """Render a publication-quality tree figure (PNG + SVG + PDF) from a
    Newick string, using Bio.Phylo's own draw() on a matplotlib Axes -
    the standard, correct way to visualise a Biopython tree object.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    tree = Phylo.read(io.StringIO(newick), "newick")
    n_leaves = tree.count_terminals()

    fig_height = max(3, 0.35 * n_leaves + 1.5)
    fig, ax = plt.subplots(figsize=(10, fig_height), dpi=200)
    Phylo.draw(tree, axes=ax, do_show=False,
              branch_labels=lambda c: f"{c.branch_length:.3f}" if c.branch_length else None)

    ax.set_title(title, fontsize=13, weight="bold", loc="left")
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)

    plt.tight_layout()
    safe_title = "".join(c if c.isalnum() else "_" for c in title)[:60]
    png_path = out_dir / f"{safe_title}.png"
    svg_path = out_dir / f"{safe_title}.svg"
    pdf_path = out_dir / f"{safe_title}.pdf"
    fig.savefig(png_path, dpi=300, bbox_inches="tight")
    fig.savefig(svg_path, bbox_inches="tight")
    fig.savefig(pdf_path, bbox_inches="tight")
    plt.close(fig)

    return {
        "n_leaves": n_leaves,
        "leaf_names": [c.name for c in tree.get_terminals()],
        "images": {"png": str(png_path), "svg": str(svg_path), "pdf": str(pdf_path)},
    }


def run_phylogeny(fasta_text: str, job_dir: Path, on_progress=None) -> dict:
    n_records = fasta_text.count(">")
    if n_records < 3:
        raise ValueError(
            f"Phylogeny needs at least 3 sequences to build a meaningful tree "
            f"(found {n_records}). Add more sequences."
        )

    result = build_phylogeny(fasta_text, job_dir, on_progress)
    viz_dir = job_dir / "viz"
    render = render_tree(result["newick"], viz_dir, title="Phylogenetic tree")

    (job_dir / "phylogeny_summary.json").write_text(json.dumps({
        "n_leaves": render["n_leaves"],
        "leaf_names": render["leaf_names"],
    }, indent=2))

    logger.info(f"Phylogeny built: {render['n_leaves']} leaves")

    return {
        "method": "EBI Clustal Omega (alignment) + EBI Simple Phylogeny "
                 "(neighbour-joining tree) - both live queries",
        "n_leaves": render["n_leaves"],
        "leaf_names": render["leaf_names"],
        "newick": result["newick"],
        "alignment": result["alignment"],
        "images": render["images"],
        "files": {
            **result["files"],
            "summary_json": str(job_dir / "phylogeny_summary.json"),
        },
        "errors": [],
    }
