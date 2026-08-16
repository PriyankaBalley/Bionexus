"""Module: Subcellular localization — DTU TargetP-2.0 (primary) + WoLF
PSORT (cross-check), both live queries.

TargetP-2.0 (Almagro Armenteros et al. 2019) predicts N-terminal
targeting peptides (signal peptide / mitochondrial transfer peptide /
chloroplast transfer peptide / other) using a deep learning model - see
targetp_remote.py for the live client and how its JSON endpoint was
found (from the tool's own Angular bundle, not guessed).

WoLF PSORT (Horton et al. 2007) predicts a full localization class
(nucleus, cytoplasm, chloroplast, mitochondria, plasma membrane, etc.)
from sequence composition and known sorting signals - see
wolfpsort_remote.py. Its processing backend was intermittently
unresponsive when this was written; the job is still submitted and
polled for a real result, and its absence is reported honestly rather
than silently ignored.

Sequences are queried as "plant" organism in both tools, matching this
platform's focus (adds the chloroplast transfer peptide class to
TargetP, which is otherwise absent for non-plant organisms).
"""
from __future__ import annotations
import csv
import json
from pathlib import Path

from app.core.logging import logger
from app.services.targetp_remote import run_targetp, EXAMPLE_SEQUENCE
from app.services.wolfpsort_remote import run_wolfpsort

__all__ = ["run_localization", "EXAMPLE_SEQUENCE"]


def run_localization(sequences: list[tuple[str, str]], job_dir: Path,
                     on_progress=None) -> dict:
    fasta_text = "\n".join(f">{sid}\n{seq}" for sid, seq in sequences)
    errors: list[str] = []

    if on_progress:
        on_progress("TargetP")
    try:
        targetp_raw = run_targetp(fasta_text, organism="pl", on_progress=on_progress)
        targetp_seqs = targetp_raw.get("SEQUENCES", {})
    except Exception as e:
        msg = f"TargetP live query failed: {e}"
        logger.warning(msg)
        errors.append(msg)
        targetp_seqs = {}

    if on_progress:
        on_progress("WoLF PSORT")
    try:
        wolfpsort_result = run_wolfpsort(fasta_text, organism_type="plant", on_progress=on_progress)
    except Exception as e:
        msg = f"WoLF PSORT live query failed: {e}"
        logger.warning(msg)
        errors.append(msg)
        wolfpsort_result = {}

    results: dict[str, dict] = {}
    summary_rows = []

    for seq_id, seq in sequences:
        tp = targetp_seqs.get(seq_id)
        wp = wolfpsort_result.get(seq_id)

        targetp_call = {
            "prediction": tp["Prediction"],
            "likelihoods": dict(zip(tp["Protein_types"], tp["Likelihood"])),
            "cleavage_site": tp.get("CS_pos") or None,
        } if tp else None

        wolfpsort_call = {
            "prediction": wp["predicted_class_name"],
            "score": wp["score"],
        } if wp else None

        results[seq_id] = {"targetp": targetp_call, "wolfpsort": wolfpsort_call}
        summary_rows.append({
            "sequence_id": seq_id,
            "targetp_prediction": targetp_call["prediction"] if targetp_call else "unavailable",
            "wolfpsort_prediction": wolfpsort_call["prediction"] if wolfpsort_call else "unavailable",
        })
        logger.info(f"{seq_id}: TargetP={summary_rows[-1]['targetp_prediction']}, "
                   f"WoLF PSORT={summary_rows[-1]['wolfpsort_prediction']}")

    (job_dir / "localization_results.json").write_text(json.dumps(results, indent=2))

    summary_csv = job_dir / "localization_summary.csv"
    with summary_csv.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["sequence_id", "targetp_prediction", "wolfpsort_prediction"])
        w.writeheader()
        w.writerows(summary_rows)

    return {
        "method": "DTU TargetP-2.0 (live) + WoLF PSORT (live), organism=plant",
        "sequences": summary_rows,
        "results": results,
        "files": {
            "json": str(job_dir / "localization_results.json"),
            "summary_csv": str(summary_csv),
        },
        "errors": errors,
    }
