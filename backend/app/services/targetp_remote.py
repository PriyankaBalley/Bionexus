"""Module: N-terminal targeting peptide prediction — DTU TargetP-2.0
(live), used for the Subcellular Localization module.

TargetP predicts signal peptides, mitochondrial transfer peptides and
(for plants) chloroplast transfer peptides from the N-terminus - it is
a localization-signal predictor, not a transmembrane-helix predictor
(that's Phobius, used separately in the Transmembrane module).

Submission goes through DTU's webface2.cgi (the same CGI submission
system used across their tool suite - SignalP, NetNGlyc, etc.), and the
result is fetched from a discovered, real JSON endpoint
(TargetP-2.0/js/targetp2.js: JSONLink = ".../tmp/<jobid>/output.json"),
not an assumed/guessed URL pattern.

Almagro Armenteros JJ, Salvatore M, Emanuelsson O, et al. "Detecting
sequence signals in targeting peptides using deep learning." Life
Science Alliance 2019;2(5):e201900429.
"""
from __future__ import annotations
import re
import time

import requests

from app.core.logging import logger

_SUBMIT_URL = "https://services.healthtech.dtu.dk/cgi-bin/webface2.cgi"
_JSON_URL = "https://services.healthtech.dtu.dk/services/TargetP-2.0/tmp/{job_id}/output.json"
_CONFIGFILE = "/var/www/services/services/TargetP-2.0/webface.cf"
_POLL_INTERVAL_S = 4
_MAX_WAIT_S = 300

EXAMPLE_SEQUENCE = (
    # Real Arabidopsis RBCS-1A, UniProt P10795 (fetched live) - genuinely
    # chloroplast-targeted; TargetP calls this correctly (Chloroplast
    # transfer peptide, ~99.8% likelihood) where composition-only
    # heuristics cannot distinguish it from a mitochondrial presequence.
    ">P10795_RBCS1A\n"
    "MASSMLSSATMVASPAQATMVAPFNGLKSSAAFPATRKANNDITSITSNGGRVNCMQVWP\n"
    "PIGKKKFETLSYLPDLTDSELAKEVDYLIRNKWIPCVEFELEHGFVYREHGNSPGYYDGR\n"
    "YWTMWKLPLFGCTDSAQVLKEVEECKKEYPNAFIRIIGFDNTRQVQCISFIAYKPPSFTG\n"
)


def _submit(fasta_text: str, organism: str) -> str:
    files = {"uploadfile": ("sequences.fasta", fasta_text, "text/plain")}
    data = {"configfile": _CONFIGFILE, "organism": organism, "format": "short"}
    r = requests.post(_SUBMIT_URL, files=files, data=data, timeout=30)
    r.raise_for_status()
    m = re.search(r"jobid=([A-F0-9]+)", r.url)
    if not m:
        raise RuntimeError(f"Could not find job id in TargetP response URL: {r.url}")
    return m.group(1)


def run_targetp(fasta_text: str, organism: str = "pl", on_progress=None) -> dict:
    """Submit sequences to live TargetP-2.0 and return the parsed JSON
    result once available. organism: "pl" (plant, adds chloroplast
    transfer peptide as a class) or "non-pl".
    """
    job_id = _submit(fasta_text, organism)
    logger.info(f"TargetP job submitted: {job_id}")

    waited = 0
    while waited < _MAX_WAIT_S:
        r = requests.get(_JSON_URL.format(job_id=job_id), timeout=20)
        if r.status_code == 200:
            return r.json()
        if on_progress:
            on_progress("RUNNING")
        time.sleep(_POLL_INTERVAL_S)
        waited += _POLL_INTERVAL_S
    raise TimeoutError(f"TargetP job {job_id} did not finish within {_MAX_WAIT_S}s")
