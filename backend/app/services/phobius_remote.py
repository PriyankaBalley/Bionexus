"""Module: Transmembrane topology + signal peptide prediction — EBI
Phobius (live), same EBI Job Dispatcher infrastructure already used
elsewhere in this app.

Fetches both output formats Phobius offers:
  - "short": one line per sequence (TM helix count, signal-peptide
    flag, compact prediction string) - simple, stable, low parsing
    risk, used as the authoritative summary numbers.
  - "long": an EMBL feature-table style block per sequence with exact
    SIGNAL/TRANSMEM/DOMAIN residue ranges - used opportunistically to
    draw exact topology boundaries; if its format doesn't match what
    we expect, we fall back to a schematic plot built from the short
    format's counts alone rather than failing the whole job.

Käll L, Krogh A, Sonnhammer ELL (2004). "A Combined Transmembrane
Topology and Signal Peptide Prediction Method." J Mol Biol 338:1027-1036.
"""
from __future__ import annotations
import re
import time

import requests

from app.core.logging import logger

_EBI_BASE = "https://www.ebi.ac.uk/Tools/services/rest/phobius"
_EMAIL = "editease-jobs@example.com"
_POLL_INTERVAL_S = 5
_MAX_WAIT_S = 900

EXAMPLE_SEQUENCE = (
    # Real bacteriorhodopsin, UniProt P02945 - a well-characterised
    # 7-transmembrane-helix protein, fetched live.
    ">P02945_bacteriorhodopsin\n"
    "MLELLPTAVEGVSQAQITGRPEWIWLALGTALMGLGTLYFLVKGMGVSDPDAKKFYAITT\n"
    "LVPAIAFTMYLSMLLGYGLTMVPFGGEQNPIYWARYADWLFTTPLLLLDLALLVDADQGT\n"
    "ILALVGADGIMIGTGLVGALTKVYSYRFVWWAISTAAMLYILYVLFFGFTSKAESMRPEV\n"
    "ASTFKVLRNVTVVLWSAYPVVWLIGSEGAGIVPLNIETLLFMVLDVSAKVGFGLILLRSR\n"
    "AIFGEAEAPEPSAGDGAAATSD\n"
)


def _submit(fmt: str, fasta_text: str) -> str:
    r = requests.post(f"{_EBI_BASE}/run", data={
        "email": _EMAIL, "format": fmt, "stype": "protein", "sequence": fasta_text,
    }, timeout=30)
    r.raise_for_status()
    job_id = r.text.strip()
    if not job_id or " " in job_id:
        raise RuntimeError(f"Unexpected job id from EBI Phobius: {job_id!r}")
    return job_id


def _poll(job_id: str, on_progress=None) -> None:
    waited = 0
    while waited < _MAX_WAIT_S:
        status = requests.get(f"{_EBI_BASE}/status/{job_id}", timeout=30).text.strip()
        if status == "FINISHED":
            return
        if status in ("ERROR", "FAILURE", "NOT_FOUND"):
            raise RuntimeError(f"EBI Phobius job {job_id} ended with status {status}")
        if on_progress:
            on_progress(status)
        time.sleep(_POLL_INTERVAL_S)
        waited += _POLL_INTERVAL_S
    raise TimeoutError(f"EBI Phobius job {job_id} did not finish within {_MAX_WAIT_S}s")


def _parse_short(text: str) -> dict[str, dict]:
    """SEQENCE ID / TM / SP / PREDICTION columns, one row per sequence."""
    out = {}
    for line in text.strip().splitlines():
        if not line.strip() or line.upper().startswith(("ID", "SEQENCE", "SEQUENCE")):
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        seq_id, tm, sp = parts[0], parts[1], parts[2]
        out[seq_id] = {
            "tm_count": int(tm) if tm.isdigit() else 0,
            "has_signal_peptide": sp.strip().upper() == "Y",
            "prediction_string": parts[3],
        }
    return out


def _parse_long(text: str) -> dict[str, list[dict]]:
    """Best-effort parse of the EMBL feature-table style long format into
    per-sequence lists of {kind, start, end, label} regions. Returns an
    empty dict (not an error) if nothing matches, so callers can fall
    back to the short-format summary instead of failing.
    """
    out: dict[str, list[dict]] = {}
    current_id = None
    for line in text.splitlines():
        id_m = re.match(r"^ID\s+(\S+)", line)
        if id_m:
            current_id = id_m.group(1)
            out[current_id] = []
            continue
        ft_m = re.match(
            r"^FT\s+(SIGNAL|TRANSMEM|DOMAIN|REGION)\s+(\d+)\s+(\d+)\s*(.*)$", line
        )
        if ft_m and current_id:
            kind, start, end, label = ft_m.groups()
            out[current_id].append({
                "kind": kind, "start": int(start), "end": int(end),
                "label": label.strip().rstrip("."),
            })
    return {k: v for k, v in out.items() if v}


def run_phobius(fasta_text: str, on_progress=None) -> dict:
    """Submit one query and fetch both short (authoritative counts) and
    long (topology boundaries, best-effort) results.
    """
    job_short = _submit("short", fasta_text)
    logger.info(f"Phobius (short) job submitted: {job_short}")
    _poll(job_short, on_progress)
    short_text = requests.get(f"{_EBI_BASE}/result/{job_short}/out", timeout=30).text
    short = _parse_short(short_text)

    long_regions: dict[str, list[dict]] = {}
    try:
        job_long = _submit("long", fasta_text)
        logger.info(f"Phobius (long) job submitted: {job_long}")
        _poll(job_long, on_progress)
        long_text = requests.get(f"{_EBI_BASE}/result/{job_long}/out", timeout=30).text
        long_regions = _parse_long(long_text)
    except Exception as e:
        logger.warning(f"Phobius long-format topology unavailable, using short-format "
                       f"counts only: {e}")

    return {"summary": short, "regions": long_regions, "raw_short": short_text}
