"""Live adapter for PlantPAN 5 (https://plantpan.itps.ncku.edu.tw/plantpan5/).

PlantCARE has no synchronous API (its own submission form states results are
emailed back, with an explicit request to sleep 60s between scripted
requests), so it can't be made "live" - see promoter.py / cis_motifs.py for
the local curated-library fallback used for that database.

PlantPAN 5, in contrast, is a modern form-POST app that returns results
synchronously: POSTing a FASTA sequence to `promoter_results.php` returns an
HTML dashboard page that embeds a per-request `file_prefix` id, which the
page's own JavaScript uses to fetch the actual TFBS hit table as a plain TSV
file from `program_base/tempfile/{file_prefix}_promoter_analysis.txt`. We
replicate exactly that: submit the form, extract the file_prefix, fetch the
TSV ourselves, and parse it into the same hit-dict shape used by the local
scanner in promoter.py.
"""
from __future__ import annotations
import csv
import io
import re
import requests

from app.core.logging import logger

PLANTPAN_BASE = "https://plantpan.itps.ncku.edu.tw/plantpan5"
PLANTPAN_SUBMIT_URL = f"{PLANTPAN_BASE}/promoter_results.php"

# Species PlantPAN's own form has pre-checked by default.
DEFAULT_TFBS_SPECIES = ["Arabidopsis thaliana", "Glycine max", "Oryza sativa", "Zea mays"]

_FILE_PREFIX_RE = re.compile(r'const\s+file_prefix\s*=\s*"([^"]+)"')


def fetch_plantpan_hits(
    seq_id: str,
    seq_str: str,
    species: list[str] | None = None,
    min_score: float = 0.75,
    timeout: int = 180,
) -> list[dict]:
    """Submit a sequence to the real PlantPAN 5 promoter analysis tool and
    return live TFBS hits in the same shape as promoter.scan_motifs()'s
    output. Raises ValueError/requests exceptions on failure - callers
    should catch and degrade gracefully rather than failing the whole job.
    """
    species = species or DEFAULT_TFBS_SPECIES
    fasta_text = f">{seq_id}\n{seq_str}"

    data = {
        "sequence": fasta_text,
        "input_type": "manual",
        "motif": "database",
        "motif_lib_version": "v1_1",
        "choose": "others",
        "TFBSspecies[]": species,
        "mode[]": ["Tandem", "CpNpG"],
    }
    resp = requests.post(PLANTPAN_SUBMIT_URL, data=data, timeout=timeout)
    resp.raise_for_status()

    m = _FILE_PREFIX_RE.search(resp.text)
    if not m:
        raise ValueError(
            "PlantPAN: couldn't find a result file_prefix in the response - "
            "the site's page format may have changed"
        )
    file_prefix = m.group(1)

    tsv_url = f"{PLANTPAN_BASE}/program_base/tempfile/{file_prefix}_promoter_analysis.txt"
    tsv_resp = requests.get(tsv_url, timeout=60)
    tsv_resp.raise_for_status()
    if not tsv_resp.text.strip():
        return []

    hits: list[dict] = []
    reader = csv.DictReader(io.StringIO(tsv_resp.text), delimiter="\t")
    for row in reader:
        try:
            score = float(row["Similar Score"])
        except (KeyError, ValueError):
            continue
        if score < min_score:
            continue
        try:
            start = int(row["Position"])
        except (KeyError, ValueError):
            continue
        matched_seq = row.get("Hit Sequence", "")
        end = start + len(matched_seq) - 1
        strand = row.get("Strand", "+").strip() or "+"
        tf_family = row.get("TF Family", "").strip()
        tf_ids = row.get("TF ID or Motif Name", "").strip()
        matrix_id = row.get("Matrix ID", "").strip()

        hits.append({
            "name": tf_family or matrix_id or "PlantPAN TFBS",
            "sequence": matched_seq,
            "start": start,
            "end": end,
            "strand": "+" if strand == "+" else "-",
            "score": round(score, 3),
            "description": f"{matrix_id} ({tf_ids})" if tf_ids else matrix_id,
            "database": "PlantPAN",
        })

    logger.info(f"PlantPAN live: {seq_id} -> {len(hits)} hits (score>={min_score})")
    return hits
