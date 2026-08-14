"""Module 1: sequence retrieval from NCBI, Ensembl Plants, Sol Genomics Network."""
from __future__ import annotations
import io
import re
import time
import requests
from pathlib import Path
from Bio import Entrez, SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord

from app.core.config import settings
from app.core.logging import logger


# ── NCBI ─────────────────────────────────────────────────────────────────────
def _setup_entrez() -> None:
    Entrez.email = settings.NCBI_EMAIL
    if settings.NCBI_API_KEY:
        Entrez.api_key = settings.NCBI_API_KEY


def fetch_ncbi(query: str, upstream: int, downstream: int, region: str) -> SeqRecord:
    """Fetch a sequence from NCBI Nucleotide. Query may be an accession or gene name."""
    _setup_entrez()

    # Resolve gene name to nucleotide if needed
    accession = query
    if not _looks_like_accession(query):
        handle = Entrez.esearch(db="nucleotide", term=query, retmax=1)
        rec = Entrez.read(handle); handle.close()
        if not rec["IdList"]:
            raise ValueError(f"NCBI: no records for '{query}'")
        accession = rec["IdList"][0]
        logger.info(f"NCBI resolved '{query}' -> {accession}")

    # Fetch GenBank (metadata only) to learn feature locations and total length.
    # For whole-chromosome/scaffold-level accessions NCBI omits both the feature
    # table and the sequence bases from this record, so record.seq must not be
    # used directly - the actual bases are pulled separately below via a
    # server-side-bounded FASTA request (fast even for multi-Mb chromosomes).
    handle = Entrez.efetch(db="nucleotide", id=accession, rettype="gb", retmode="text")
    record = SeqIO.read(handle, "genbank"); handle.close()
    total_len = len(record.seq)

    if region == "promoter" and upstream > 0:
        feat_start = _first_feature_start(record)
        if feat_start is None:
            raise ValueError(
                f"NCBI: '{accession}' has no gene/CDS/mRNA feature to anchor a promoter "
                f"region (likely a whole-chromosome/scaffold accession) - use a gene- or "
                f"mRNA-level accession, or the 'gene'/'custom' region instead"
            )
        s = max(0, feat_start - upstream)
        e = feat_start + downstream
        out_id, out_desc = f"{accession}_promoter", f"upstream={upstream} downstream={downstream} of {accession}"
    else:
        s = 0
        e = min(total_len, settings.MAX_SEQUENCE_LENGTH)
        out_id, out_desc = accession, record.description

    sub = _fetch_fasta_range(accession, s, e)
    sub.id, sub.description = out_id, out_desc
    return sub


def _fetch_fasta_range(accession: str, start: int, end: int) -> SeqRecord:
    """Fetch bases [start, end) (0-based, half-open) directly from NCBI as FASTA,
    bounded server-side so we never download an entire chromosome into memory."""
    handle = Entrez.efetch(
        db="nucleotide", id=accession, rettype="fasta", retmode="text",
        seq_start=start + 1, seq_stop=max(end, start + 1),
    )
    rec = SeqIO.read(handle, "fasta"); handle.close()
    return rec


def _looks_like_accession(q: str) -> bool:
    if q.startswith(("NC_", "NM_", "XM_", "NR_", "XR_", "NP_", "XP_", "YP_")):
        return True
    # Heuristic: short token with digits and a dot/underscore (e.g. NM_001036960.2)
    return len(q) <= 25 and any(c.isdigit() for c in q) and ("_" in q or "." in q)


def _first_feature_start(rec: SeqRecord) -> int | None:
    for feat in rec.features:
        if feat.type in ("CDS", "gene", "mRNA"):
            return int(feat.location.start)
    return None


# ── Ensembl Plants (REST) ────────────────────────────────────────────────────
def fetch_ensembl_plants(query: str, species: str | None,
                         upstream: int, downstream: int, region: str) -> SeqRecord:
    """Fetch sequence from Ensembl Plants REST API."""
    base = settings.ENSEMBL_PLANTS_URL.rstrip("/")
    species = species or "arabidopsis_thaliana"
    headers = {"Content-Type": "application/json"}

    # Lookup gene to get coordinates. Ensembl's symbol-lookup returns 400 (not
    # just 404) for an unresolved symbol, so treat any non-2xx as "try as a
    # direct stable ID instead" (e.g. systematic locus IDs like AT1G01010).
    lookup = requests.get(
        f"{base}/lookup/symbol/{species}/{query}",
        headers=headers, timeout=30,
    )
    if not lookup.ok:
        lookup = requests.get(f"{base}/lookup/id/{query}", headers=headers, timeout=30)
    lookup.raise_for_status()
    info = lookup.json()

    seq_region = info["seq_region_name"]
    start = int(info["start"])
    end = int(info["end"])
    strand = int(info.get("strand", 1))

    if region == "promoter":
        if strand == 1:
            r_start = max(1, start - upstream)
            r_end = start + downstream
        else:
            r_start = max(1, end - downstream)
            r_end = end + upstream
    else:
        r_start = start
        r_end = end

    region_str = f"{seq_region}:{r_start}..{r_end}:{strand}"
    seq_resp = requests.get(
        f"{base}/sequence/region/{species}/{region_str}",
        headers={"Content-Type": "text/x-fasta"},
        timeout=60,
    )
    seq_resp.raise_for_status()

    rec = SeqIO.read(io.StringIO(seq_resp.text), "fasta")
    rec.id = f"{query}_{region}"
    rec.description = f"Ensembl Plants {species} {region_str}"
    return rec


# ── Sol Genomics Network ─────────────────────────────────────────────────────
_SGN_FEATURE_LINK_RE = re.compile(r'/feature/(\d+)/details">([^<]+)</a>')


def fetch_sgn(query: str, upstream: int, downstream: int, region: str) -> SeqRecord:
    """Fetch a sequence from Sol Genomics Network (SGN).

    SGN has no documented JSON sequence API; it's a Chado/Catalyst app whose
    gene pages are server-rendered HTML. We use its internal search widget
    endpoint (/ajax/search/features, the same one the site's own search box
    calls) to resolve the gene to a Chado feature_id, scrape that feature's
    "details" page for its genomic coordinates/strand and the source-scaffold
    feature id, then pull the actual bases via SGN's own
    /api/v1/sequence/download/single/<srcfeature_id>.fasta?<start>..<end>
    endpoint (the same one exposed via the page's "Download sequence" link),
    which lets us request an arbitrary coordinate range for promoter/downstream
    extension without downloading the whole scaffold.
    """
    base = settings.SGN_URL.rstrip("/")

    search_resp = requests.get(
        f"{base}/ajax/search/features", params={"name": query, "length": 50}, timeout=30,
    )
    search_resp.raise_for_status()
    rows = search_resp.json().get("data") or []

    feature_id = None
    for row in rows:
        if len(row) < 3 or row[1] != "gene":
            continue
        m = _SGN_FEATURE_LINK_RE.search(row[2])
        if m and m.group(2).split(".")[0].lower() == query.split(".")[0].lower():
            feature_id = m.group(1)
            break
    if feature_id is None:
        raise ValueError(f"SGN: no gene found for '{query}'")

    detail_resp = requests.get(f"{base}/feature/{feature_id}/details", timeout=30)
    detail_resp.raise_for_status()
    html = detail_resp.text

    loc_m = re.search(
        r'Location\(s\)</span>\s*<div class="info_table_fieldval">\s*<div>([^<]+)</div>', html,
    )
    if not loc_m:
        raise ValueError(f"SGN: no genomic location found for '{query}' (feature {feature_id})")
    seq_region, start_s, end_s = re.match(r"([^:]+):(\d+)\.\.(\d+)", loc_m.group(1)).groups()
    start, end = int(start_s), int(end_s)

    dl_m = re.search(r"/api/v1/sequence/download/single/(\d+)\.fasta\?\d+\.\.\d+", html)
    if not dl_m:
        raise ValueError(f"SGN: no downloadable sequence region for '{query}' (feature {feature_id})")
    srcfeature_id = dl_m.group(1)

    strand_m = re.search(
        rf'>{re.escape(seq_region)}:{start}\.\.{end}</td>\s*<td[^>]*>[^<]*</td>\s*<td[^>]*>([+-])</td>', html,
    )
    strand = strand_m.group(1) if strand_m else "+"

    if region == "promoter":
        if strand == "+":
            r_start = max(1, start - upstream)
            r_end = start + downstream
        else:
            r_start = max(1, end - downstream)
            r_end = end + upstream
    else:
        r_start, r_end = start, end

    seq_resp = requests.get(
        f"{base}/api/v1/sequence/download/single/{srcfeature_id}.fasta?{r_start}..{r_end}",
        timeout=60,
    )
    seq_resp.raise_for_status()
    if not seq_resp.text.strip().startswith(">"):
        raise ValueError(f"SGN: sequence download failed for '{query}' (feature {feature_id})")

    rec = SeqIO.read(io.StringIO(seq_resp.text), "fasta")
    rec.id = f"{query}_{region}"
    rec.description = f"SGN {seq_region}:{r_start}..{r_end} gene={query}"
    return rec


# ── Gramene ──────────────────────────────────────────────────────────────────
def fetch_gramene(query: str, upstream: int, downstream: int, region: str) -> SeqRecord:
    """Fetch a sequence via Gramene.

    Gramene's own REST API (data.gramene.org) is a gene/annotation search
    service (Solr/MongoDB-backed) with no endpoint for raw base sequence.
    Its core plant genomes (Arabidopsis, rice, maize, wheat, and other grasses)
    are built from the same underlying core databases as Ensembl Plants, so we
    resolve the gene's coordinates/species on Gramene, then pull the actual
    bases from Ensembl Plants' sequence endpoint using those coordinates.
    Species not curated by Gramene (e.g. soybean, tomato) will not resolve.
    """
    base = settings.GRAMENE_URL.rstrip("/")
    resp = requests.get(f"{base}/genes", params={"idList": query}, timeout=30)
    resp.raise_for_status()
    records = resp.json()
    if not records:
        raise ValueError(f"Gramene: no gene found for '{query}'")
    gene = records[0]

    species = gene["system_name"]
    loc = gene["location"]
    seq_region = loc["region"]
    start, end, strand = int(loc["start"]), int(loc["end"]), int(loc["strand"])

    if region == "promoter":
        if strand == 1:
            r_start = max(1, start - upstream)
            r_end = start + downstream
        else:
            r_start = max(1, end - downstream)
            r_end = end + upstream
    else:
        r_start, r_end = start, end

    region_str = f"{seq_region}:{r_start}..{r_end}:{strand}"
    seq_resp = requests.get(
        f"{settings.ENSEMBL_PLANTS_URL.rstrip('/')}/sequence/region/{species}/{region_str}",
        headers={"Content-Type": "text/x-fasta"},
        timeout=60,
    )
    if seq_resp.status_code == 404:
        raise ValueError(
            f"Gramene: gene '{query}' resolved to species '{species}', but its base "
            f"sequence is not available via Ensembl Plants (Gramene metadata found, "
            f"sequence lookup failed)"
        )
    seq_resp.raise_for_status()

    rec = SeqIO.read(io.StringIO(seq_resp.text), "fasta")
    rec.id = f"{query}_{region}"
    rec.description = f"Gramene {species} {region_str} gene={gene.get('name') or query}"
    return rec


# ── Dispatcher + persistence ─────────────────────────────────────────────────
def retrieve_sequence(source: str, query: str, species: str | None,
                      upstream: int, downstream: int, region: str,
                      job_dir: Path) -> dict:
    logger.info(f"Retrieve {source} query={query} up={upstream} down={downstream}")

    if source == "ncbi":
        rec = fetch_ncbi(query, upstream, downstream, region)
    elif source == "ensembl_plants":
        rec = fetch_ensembl_plants(query, species, upstream, downstream, region)
    elif source == "sgn":
        rec = fetch_sgn(query, upstream, downstream, region)
    elif source == "gramene":
        rec = fetch_gramene(query, upstream, downstream, region)
    else:
        raise ValueError(f"Unknown source: {source}")

    # Validate length
    if len(rec.seq) > settings.MAX_SEQUENCE_LENGTH:
        rec = rec[: settings.MAX_SEQUENCE_LENGTH]
        logger.warning(f"Truncated to MAX_SEQUENCE_LENGTH={settings.MAX_SEQUENCE_LENGTH}")

    fasta_path = job_dir / "sequence.fasta"
    SeqIO.write([rec], fasta_path, "fasta")

    return {
        "id": rec.id,
        "description": rec.description,
        "length": len(rec.seq),
        "fasta_path": str(fasta_path),
        "preview": str(rec.seq[:120]) + ("..." if len(rec.seq) > 120 else ""),
    }
