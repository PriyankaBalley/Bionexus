"""Module: Subcellular localization prediction — WoLF PSORT (live), used
alongside TargetP in the Subcellular Localization module.

Submission goes through the real HTML form at wolfpsort.hgc.jp (plain
multipart POST, not a JS single-page app), which redirects (via a meta
refresh) to a polling URL that eventually renders a one-line-per-sequence
result. Confirmed against wolfpsort.hgc.jp/results/example.html, whose
real format is:

    SEQID details CLASS: SCORE similar to seq REF of class CLASS

WoLF PSORT's own processing backend was intermittently unresponsive at
the time this was written (a real, confirmed job never completed after
several minutes of polling); this client is written against its real,
documented submission and output format regardless, since that part is
independently verifiable from wolfpsort.hgc.jp's own pages.

Horton P, Park KJ, Obayashi T, et al. "WoLF PSORT: protein localization
predictor." Nucleic Acids Research 2007;35:W585-W587.
"""
from __future__ import annotations
import re
import time

import requests

from app.core.logging import logger

_BASE = "https://wolfpsort.hgc.jp"
_POLL_INTERVAL_S = 5
_MAX_WAIT_S = 300

_CLASS_NAMES = {
    "chlo": "Chloroplast", "cysk": "Cytoskeleton", "cyto": "Cytoplasm",
    "E.R.": "Endoplasmic reticulum", "extr": "Extracellular", "golg": "Golgi apparatus",
    "lyso": "Lysosome", "mito": "Mitochondria", "nucl": "Nucleus",
    "pero": "Peroxisome", "plas": "Plasma membrane", "vacu": "Vacuole",
}

EXAMPLE_SEQUENCE = (
    # Same real RBCS-1A example used for TargetP, UniProt P10795.
    ">P10795_RBCS1A\n"
    "MASSMLSSATMVASPAQATMVAPFNGLKSSAAFPATRKANNDITSITSNGGRVNCMQVWP\n"
    "PIGKKKFETLSYLPDLTDSELAKEVDYLIRNKWIPCVEFELEHGFVYREHGNSPGYYDGR\n"
    "YWTMWKLPLFGCTDSAQVLKEVEECKKEYPNAFIRIIGFDNTRQVQCISFIAYKPPSFTG\n"
)


def _submit(fasta_text: str, organism_type: str) -> str:
    r = requests.post(f"{_BASE}/?submitted=1", data={
        "fasta_input": fasta_text, "organism_type": organism_type,
        "input_type": "fasta", "submit_sequence": "Submit",
    }, timeout=30)
    r.raise_for_status()
    m = re.search(r'URL=\?submitted=1&id=([A-Za-z0-9]+)', r.text)
    if not m:
        raise RuntimeError("Could not find WoLF PSORT job id in submission response")
    return m.group(1)


def _parse_result(text: str) -> dict[str, dict]:
    """One line per sequence: 'SEQID details CLASS: SCORE similar to seq
    REF of class CLASS' (confirmed against the tool's own example page).
    """
    out = {}
    for m in re.finditer(
        r"^(\S+)\s+.*?([a-zA-Z.]+):\s*(\d+)", text, re.M
    ):
        seq_id, top_class, score = m.groups()
        out[seq_id] = {
            "predicted_class": top_class,
            "predicted_class_name": _CLASS_NAMES.get(top_class, top_class),
            "score": int(score),
        }
    return out


def run_wolfpsort(fasta_text: str, organism_type: str = "plant", on_progress=None) -> dict:
    job_id = _submit(fasta_text, organism_type)
    logger.info(f"WoLF PSORT job submitted: {job_id}")

    waited = 0
    while waited < _MAX_WAIT_S:
        r = requests.get(f"{_BASE}/?submitted=1&id={job_id}", timeout=20)
        if "Processing" not in r.text:
            return _parse_result(r.text)
        if on_progress:
            on_progress("RUNNING")
        time.sleep(_POLL_INTERVAL_S)
        waited += _POLL_INTERVAL_S
    raise TimeoutError(f"WoLF PSORT job {job_id} did not finish within {_MAX_WAIT_S}s")
