"""Module 2: Promoter analysis - cis-element & TFBS scanning.

Strategy:
- PlantCARE has no usable synchronous API (its own submission form emails
  results back, with an explicit request to script users to sleep 60s
  between requests) - it can't be made "live", so we ship a curated motif
  library (`tools/cis_motifs.py`) and scan it locally.
- PlantPAN is queried LIVE against the real plantpan.itps.ncku.edu.tw
  service (see `plantpan_remote.py`), which returns real TFBS predictions
  from their actual matrix library rather than a local approximation.
"""
from __future__ import annotations
import re
import json
import csv
from pathlib import Path
from Bio import SeqIO
from Bio.Seq import Seq

from app.core.logging import logger
from app.tools.cis_motifs import PLANT_CIS_MOTIFS
from app.services.plantpan_remote import fetch_plantpan_hits

# IUPAC -> regex
_IUPAC = {
    "A": "A", "C": "C", "G": "G", "T": "T",
    "R": "[AG]", "Y": "[CT]", "S": "[GC]", "W": "[AT]",
    "K": "[GT]", "M": "[AC]", "B": "[CGT]", "D": "[AGT]",
    "H": "[ACT]", "V": "[ACG]", "N": "[ACGT]",
}


def iupac_to_regex(pattern: str) -> str:
    return "".join(_IUPAC.get(b.upper(), b) for b in pattern)


def reverse_complement(seq: str) -> str:
    return str(Seq(seq).reverse_complement())


def scan_motifs(seq: str, databases: list[str], min_score: float = 0.75) -> list[dict]:
    """Scan a sequence against the local curated cis-element library.

    Only PlantCARE is scanned here - PlantPAN is fetched live (see
    fetch_plantpan_hits_live below) rather than approximated from this
    static library, so "plantpan" is intentionally ignored if passed in.
    """
    seq_u = seq.upper().replace("U", "T")
    hits: list[dict] = []
    local_databases = [d for d in databases if d.lower() != "plantpan"]

    for name, pattern, desc, db in PLANT_CIS_MOTIFS:
        if db.lower() not in [d.lower() for d in local_databases]:
            continue

        rgx = re.compile(iupac_to_regex(pattern))

        # Forward strand
        for m in rgx.finditer(seq_u):
            score = _match_score(m.group(0), pattern)
            if score >= min_score:
                hits.append({
                    "name": name, "sequence": m.group(0),
                    "start": m.start() + 1, "end": m.end(),
                    "strand": "+", "score": round(score, 3),
                    "description": desc, "database": db,
                })

        # Reverse strand
        rc = reverse_complement(seq_u)
        for m in rgx.finditer(rc):
            score = _match_score(m.group(0), pattern)
            if score >= min_score:
                # Convert RC coordinates back to forward strand
                rc_start = m.start()
                rc_end = m.end()
                fwd_start = len(seq_u) - rc_end + 1
                fwd_end = len(seq_u) - rc_start
                hits.append({
                    "name": name, "sequence": m.group(0),
                    "start": fwd_start, "end": fwd_end,
                    "strand": "-", "score": round(score, 3),
                    "description": desc, "database": db,
                })

    hits.sort(key=lambda h: (h["start"], h["name"]))
    return hits


def _match_score(matched: str, pattern: str) -> float:
    """Score = fraction of fixed-letter positions that exactly match the consensus.
    Ambiguous IUPAC positions count as 1.0 (any match is valid by definition).
    """
    if len(matched) != len(pattern):
        return 0.0
    fixed_total = 0
    fixed_match = 0
    for m, p in zip(matched.upper(), pattern.upper()):
        if p in "ACGT":
            fixed_total += 1
            if m == p:
                fixed_match += 1
    if fixed_total == 0:
        return 1.0
    return fixed_match / fixed_total


def disambiguate_records(records: list) -> list[tuple[str, object]]:
    """Assign a unique id to each FASTA record, disambiguating repeated
    headers (e.g. a multi-transcript file with the same gene name more than
    once) as "name__2", "name__3", etc.

    Used by both analyze_promoter (so duplicate headers don't silently
    overwrite each other's hits) and visualization.render_all (which must
    use the exact same id<->record pairing - a prior version built its own
    separate id->record dict there that collapsed duplicates differently,
    silently dropping the visualization for every id past the first
    occurrence and mismatching sequence length for the survivor).

    Deliberately avoids "#" as a separator: these ids end up embedded
    unencoded in download URLs (see api/jobs.py), and "#" is parsed by
    browsers as a URL fragment separator, silently truncating the path.
    """
    seen_ids: dict[str, int] = {}
    out = []
    for rec in records:
        seen_ids[rec.id] = seen_ids.get(rec.id, 0) + 1
        unique_id = rec.id if seen_ids[rec.id] == 1 else f"{rec.id}__{seen_ids[rec.id]}"
        out.append((unique_id, rec))
    return out


def analyze_promoter(fasta_path: Path, databases: list[str], min_score: float,
                     job_dir: Path, plantpan_min_score: float | None = None) -> dict:
    """Run promoter analysis, write CSV/JSON outputs, return summary.

    min_score filters the local PlantCARE scan; plantpan_min_score
    independently filters live PlantPAN hits by their own similarity score
    (falls back to min_score if not given, for backward compatibility).
    """
    records = list(SeqIO.parse(str(fasta_path), "fasta"))
    if not records:
        raise ValueError("Input FASTA contains no sequences")

    want_plantpan = any(d.lower() == "plantpan" for d in databases)
    plantpan_min_score = min_score if plantpan_min_score is None else plantpan_min_score

    all_results: dict[str, list[dict]] = {}
    summary_rows = []
    seq_summaries = []
    errors: list[str] = []

    for unique_id, rec in disambiguate_records(records):
        seq_str = str(rec.seq)
        hits = scan_motifs(seq_str, databases, min_score)

        if want_plantpan:
            try:
                hits.extend(fetch_plantpan_hits(unique_id, seq_str, min_score=plantpan_min_score))
            except Exception as e:
                msg = f"PlantPAN live lookup failed for '{unique_id}': {e}"
                logger.warning(msg)
                errors.append(msg)

        hits.sort(key=lambda h: (h["start"], h["name"]))
        all_results[unique_id] = hits
        seq_summaries.append({"id": unique_id, "length": len(seq_str), "hits": len(hits)})
        logger.info(f"{unique_id}: {len(hits)} motif hits")

        # Per-element summary counts
        counts: dict[str, int] = {}
        for h in hits:
            counts[h["name"]] = counts.get(h["name"], 0) + 1
        for name, count in counts.items():
            summary_rows.append({"sequence_id": unique_id, "element": name, "count": count})

    # Save raw JSON
    (job_dir / "promoter_results.json").write_text(json.dumps(all_results, indent=2))

    # Save CSV of all hits
    csv_path = job_dir / "promoter_hits.csv"
    with csv_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sequence_id", "element", "database", "matched_seq",
                    "start", "end", "strand", "score", "description"])
        for seq_id, hits in all_results.items():
            for h in hits:
                w.writerow([seq_id, h["name"], h["database"], h["sequence"],
                            h["start"], h["end"], h["strand"], h["score"], h["description"]])

    # Summary CSV
    sum_path = job_dir / "promoter_summary.csv"
    with sum_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["sequence_id", "element", "count"])
        w.writeheader()
        w.writerows(summary_rows)

    return {
        "total_hits": sum(len(v) for v in all_results.values()),
        "sequences": seq_summaries,
        "results": all_results,
        "files": {
            "json":    str(job_dir / "promoter_results.json"),
            "csv":     str(csv_path),
            "summary": str(sum_path),
        },
        "errors": errors,
    }
