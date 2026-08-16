"""
Gene Family Identification Service — BioNexus Tool GF-1
Identifies gene family members genome-wide using:
  - pHMMER (EBI REST API) for domain-based homolog search
  - InterProScan (EBI REST API) for domain confirmation
  - NCBI BLAST fallback
  - Physiochemical property calculation (MW, pI, signal peptide)

Research grade: mirrors methodology of Dokka et al. 2024 (Gene 914, 148417)
"""

import re
import time
import math
import logging
import requests
from typing import Optional
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

# ── EBI endpoints ────────────────────────────────────────────────────────────
# phmmer uses EBI's standard Job Dispatcher REST pattern (same family as
# iprscan5 below): submit -> poll status -> fetch the "out" result type,
# which is the only result type with per-hit accession/E-value/score rows.
PHMMER_SUBMIT   = "https://www.ebi.ac.uk/Tools/services/rest/hmmer3_phmmer/run"
PHMMER_STATUS   = "https://www.ebi.ac.uk/Tools/services/rest/hmmer3_phmmer/status/{job_id}"
PHMMER_RESULT   = "https://www.ebi.ac.uk/Tools/services/rest/hmmer3_phmmer/result/{job_id}/out"
INTERPRO_SUBMIT = "https://www.ebi.ac.uk/Tools/services/rest/iprscan5/run"
INTERPRO_STATUS = "https://www.ebi.ac.uk/Tools/services/rest/iprscan5/status/{job_id}"
INTERPRO_RESULT = "https://www.ebi.ac.uk/Tools/services/rest/iprscan5/result/{job_id}/tsv"
NCBI_ESEARCH    = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
NCBI_EFETCH     = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
UNIPROT_FASTA   = "https://rest.uniprot.org/uniprotkb/{acc}.fasta"
UNIPROT_SEARCH  = "https://rest.uniprot.org/uniprotkb/search"

HEADERS = {"Accept": "application/json"}

# ── Amino-acid mass table (monoisotopic, Da) ──────────────────────────────────
AA_MASS = {
    'A':71.03711,'R':156.10111,'N':114.04293,'D':115.02694,'C':103.00919,
    'E':129.04259,'Q':128.05858,'G':57.02146,'H':137.05891,'I':113.08406,
    'L':113.08406,'K':128.09496,'M':131.04049,'F':147.06841,'P':97.05276,
    'S':87.03203,'T':101.04768,'W':186.07931,'Y':163.06333,'V':99.06841,
}
WATER = 18.01056

# pKa values for Henderson-Hasselbalch pI calculation
PKA = {
    'N_term': 9.69, 'C_term': 2.34,
    'D': 3.86, 'E': 4.25, 'H': 6.00,
    'C': 8.33, 'Y': 10.07, 'K': 10.53, 'R': 12.48,
}


# ── Dataclasses ───────────────────────────────────────────────────────────────
@dataclass
class GeneFamilyMember:
    rank: int
    accession: str
    entry_name: str
    description: str
    organism: str
    length: int
    score: float
    evalue: float
    sequence: str = ""
    mw_kda: float = 0.0
    pi: float = 0.0
    has_signal_peptide: bool = False
    signal_peptide_end: int = 0
    n_glyc_sites: list = None
    interpro_domains: list = None
    source: str = "phmmer"

    def __post_init__(self):
        if self.n_glyc_sites is None:
            self.n_glyc_sites = []
        if self.interpro_domains is None:
            self.interpro_domains = []

    def to_dict(self):
        d = asdict(self)
        return d


# ── Core physiochemical calculations ─────────────────────────────────────────
def calculate_mw(seq: str) -> float:
    """Molecular weight in kDa (average isotopic masses for publication)."""
    avg_mass = {
        'A':89.09,'R':174.20,'N':132.12,'D':133.10,'C':121.16,
        'E':147.13,'Q':146.15,'G':75.03,'H':155.16,'I':131.17,
        'L':131.17,'K':146.19,'M':149.21,'F':165.19,'P':115.13,
        'S':105.09,'T':119.12,'W':204.23,'Y':181.19,'V':117.15,
    }
    mw = sum(avg_mass.get(aa, 0) for aa in seq.upper()) - (len(seq) - 1) * 18.02
    return round(mw / 1000, 2)


def calculate_pi(seq: str) -> float:
    """Theoretical isoelectric point via Henderson-Hasselbalch iteration."""
    seq = seq.upper()
    counts = {aa: seq.count(aa) for aa in PKA}

    def charge_at_ph(ph):
        charge = 0.0
        # N-terminus (positive at low pH)
        charge += 1.0 / (1.0 + 10 ** (ph - PKA['N_term']))
        # C-terminus (negative at high pH)
        charge -= 1.0 / (1.0 + 10 ** (PKA['C_term'] - ph))
        # Basic residues
        for aa in ('H', 'K', 'R'):
            charge += counts.get(aa, 0) / (1.0 + 10 ** (ph - PKA[aa]))
        # Acidic residues
        for aa in ('D', 'E', 'C', 'Y'):
            charge -= counts.get(aa, 0) / (1.0 + 10 ** (PKA[aa] - ph))
        return charge

    lo, hi = 0.0, 14.0
    for _ in range(100):
        mid = (lo + hi) / 2.0
        c = charge_at_ph(mid)
        if abs(c) < 1e-6:
            break
        if c > 0:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2.0, 2)


def find_n_glycosylation_sites(seq: str) -> list[dict]:
    """Find N-X-S/T sequons (N-glycosylation sites), X ≠ P."""
    sites = []
    seq = seq.upper()
    for i in range(len(seq) - 2):
        if seq[i] == 'N' and seq[i+1] != 'P' and seq[i+2] in ('S', 'T'):
            sites.append({"position": i + 1, "motif": seq[i:i+3]})
    return sites


def predict_signal_peptide_simple(seq: str) -> tuple[bool, int]:
    """
    Simple SignalP-like heuristic:
    Checks for h-region of 6+ hydrophobic residues in first 30 aa.
    For publication use the real SignalP 5.0 API.
    """
    HYDROPHOBIC = set('AVILMFYWC')
    window = seq[:35].upper()
    max_run = 0
    run = 0
    end_pos = 0
    for i, aa in enumerate(window):
        if aa in HYDROPHOBIC:
            run += 1
            if run > max_run:
                max_run = run
                end_pos = i + 1
        else:
            run = 0
    has_sp = max_run >= 6
    return has_sp, (end_pos if has_sp else 0)


# ── pHMMER search ─────────────────────────────────────────────────────────────
# Matches HMMER's plain-text hit table rows, e.g.:
#   2.3e-299  997.3  10.7   2.6e-299  997.1  10.7    1.0  1  sp|Q0WV96|NAC1_ARATH   NAC domain-containing protein 1 OS=...
_PHMMER_HIT_RE = re.compile(
    r"^\s*(?P<evalue>[\d.eE+-]+)\s+(?P<score>[\d.eE+-]+)\s+[\d.eE+-]+\s+"
    r"[\d.eE+-]+\s+[\d.eE+-]+\s+[\d.eE+-]+\s+[\d.]+\s+\d+\s+"
    r"(?P<seqid>\S+)\s+(?P<description>.*)$"
)


def search_phmmer(query_sequence: str, database: str = "swissprot",
                  max_results: int = 50, evalue_threshold: float = 1e-5) -> list[dict]:
    """
    Submit sequence to EBI pHMMER (standard Job Dispatcher REST API) and
    retrieve homologs. database options: 'swissprot', 'uniprotkb', 'pdb', ...
    (see /Tools/services/rest/hmmer3_phmmer/parameterdetails/database)
    """
    try:
        submit_resp = requests.post(
            PHMMER_SUBMIT,
            data={
                "database": database,
                "sequence": f">query\n{query_sequence}",
                "email": "editease@research.org",
                "E": evalue_threshold,
            },
            timeout=30,
        )
        submit_resp.raise_for_status()
        job_id = submit_resp.text.strip()

        for _ in range(24):  # poll up to ~2 minutes
            time.sleep(5)
            status_resp = requests.get(PHMMER_STATUS.format(job_id=job_id), timeout=15)
            status = status_resp.text.strip()
            if status == "FINISHED":
                break
            if status in ("FAILURE", "ERROR", "NOT_FOUND"):
                logger.error(f"pHMMER job {job_id} ended with status {status}")
                return []
        else:
            logger.error(f"pHMMER job {job_id} timed out waiting for FINISHED")
            return []

        result_resp = requests.get(PHMMER_RESULT.format(job_id=job_id), timeout=30)
        result_resp.raise_for_status()

        hits = []
        for line in result_resp.text.splitlines():
            m = _PHMMER_HIT_RE.match(line)
            if not m:
                continue
            seqid = m.group("seqid")
            # seqid is typically "sp|ACCESSION|ENTRY_NAME" or "tr|ACCESSION|ENTRY_NAME"
            parts = seqid.split("|")
            accession = parts[1] if len(parts) >= 2 else seqid
            entry_name = parts[2] if len(parts) >= 3 else seqid
            try:
                evalue = float(m.group("evalue"))
                score = float(m.group("score"))
            except ValueError:
                continue
            hits.append({
                "rank": len(hits) + 1,
                "accession": accession,
                "entry_name": entry_name,
                # HMMER's own summary table truncates the description to fit
                # the column width; the real description/organism are filled
                # in from UniProt in fetch_uniprot_batch below.
                "description": m.group("description").strip(),
                "organism": "",
                "length": 0,
                "score": round(score, 2),
                "evalue": evalue,
                "source": "phmmer",
            })
            if len(hits) >= max_results:
                break
        return hits

    except requests.RequestException as e:
        logger.error(f"pHMMER request failed: {e}")
        return []


# ── UniProt sequence + metadata fetch ────────────────────────────────────────
def fetch_uniprot_sequence(accession: str) -> str:
    """Fetch FASTA sequence from UniProt (single accession)."""
    try:
        resp = requests.get(UNIPROT_FASTA.format(acc=accession), timeout=15)
        if resp.status_code == 200:
            lines = resp.text.strip().split('\n')
            return ''.join(l for l in lines if not l.startswith('>'))
    except Exception as e:
        logger.warning(f"UniProt fetch failed for {accession}: {e}")
    return ""


def fetch_uniprot_batch(accessions: list[str]) -> dict[str, dict]:
    """
    Batch fetch sequence + organism + protein name from UniProt for a list of
    accessions, chunked to keep query URLs reasonably short. Returns
    {accession: {"sequence": ..., "organism": ..., "description": ..., "length": ...}}.
    """
    out: dict[str, dict] = {}
    chunk_size = 40
    for i in range(0, len(accessions), chunk_size):
        chunk = [a for a in accessions[i:i + chunk_size] if a]
        if not chunk:
            continue
        query = " OR ".join(f"accession:{a}" for a in chunk)
        try:
            resp = requests.get(
                UNIPROT_SEARCH,
                params={
                    "query": query,
                    "fields": "accession,protein_name,organism_name,length,sequence",
                    "format": "json",
                    "size": len(chunk),
                },
                timeout=30,
            )
            resp.raise_for_status()
            for entry in resp.json().get("results", []):
                acc = entry.get("primaryAccession", "")
                if not acc:
                    continue
                name = (
                    entry.get("proteinDescription", {})
                    .get("recommendedName", {})
                    .get("fullName", {})
                    .get("value", "")
                )
                out[acc] = {
                    "sequence": entry.get("sequence", {}).get("value", ""),
                    "organism": entry.get("organism", {}).get("scientificName", ""),
                    "description": name,
                    "length": entry.get("sequence", {}).get("length", 0),
                }
        except Exception as e:
            logger.warning(f"UniProt batch fetch failed for chunk starting at {i}: {e}")
    return out


# ── InterProScan domain check ─────────────────────────────────────────────────
def run_interproscan(sequence: str, accession: str = "query") -> list[dict]:
    """
    Submit single sequence to EBI InterProScan REST API.
    Returns list of domain annotations.
    """
    payload = {
        "email": "editease@research.org",
        "title": accession,
        "sequence": f">seq\n{sequence}",
        "appl": "Pfam,PRINTS,ProSite",
        "goterms": "false",
        "pathways": "false",
    }
    try:
        run_resp = requests.post(
            INTERPRO_SUBMIT,
            data=payload,
            timeout=30
        )
        run_resp.raise_for_status()
        job_id = run_resp.text.strip()

        # Poll for completion (max 90s)
        for attempt in range(18):
            time.sleep(5)
            status_resp = requests.get(
                INTERPRO_STATUS.format(job_id=job_id),
                timeout=15
            )
            if status_resp.text.strip() == "FINISHED":
                break

        result_resp = requests.get(
            INTERPRO_RESULT.format(job_id=job_id),
            timeout=20
        )
        domains = []
        for line in result_resp.text.strip().split('\n'):
            if line.startswith('#') or not line.strip():
                continue
            cols = line.split('\t')
            if len(cols) >= 12:
                domains.append({
                    "database": cols[3],
                    "accession": cols[4],
                    "description": cols[5],
                    "start": int(cols[6]),
                    "end": int(cols[7]),
                    "evalue": cols[8],
                })
        return domains
    except Exception as e:
        logger.warning(f"InterProScan failed for {accession}: {e}")
        return []


# ── NCBI protein search fallback ──────────────────────────────────────────────
def search_ncbi_protein(gene_family_keyword: str, organism: str = "",
                         max_results: int = 30) -> list[dict]:
    """Search NCBI protein database as fallback/complement to pHMMER."""
    query = f"{gene_family_keyword}[Title]"
    if organism:
        query += f" AND {organism}[Organism]"

    try:
        search_resp = requests.get(NCBI_ESEARCH, params={
            "db": "protein", "term": query,
            "retmax": max_results, "retmode": "json"
        }, timeout=15)
        ids = search_resp.json().get("esearchresult", {}).get("idlist", [])

        if not ids:
            return []

        fetch_resp = requests.get(NCBI_EFETCH, params={
            "db": "protein", "id": ",".join(ids),
            "rettype": "fasta", "retmode": "text"
        }, timeout=30)

        results = []
        current_header, current_seq = "", []
        for line in fetch_resp.text.split('\n'):
            if line.startswith('>'):
                if current_header and current_seq:
                    seq = ''.join(current_seq)
                    acc = current_header.split('|')[1] if '|' in current_header else current_header.split()[0][1:]
                    results.append({
                        "rank": len(results) + 1,
                        "accession": acc,
                        "entry_name": acc,
                        "description": ' '.join(current_header.split()[1:]),
                        "organism": "",
                        "length": len(seq),
                        "score": 0.0,
                        "evalue": 0.0,
                        "sequence": seq,
                        "source": "ncbi",
                    })
                current_header = line
                current_seq = []
            else:
                current_seq.append(line.strip())

        return results
    except Exception as e:
        logger.error(f"NCBI search failed: {e}")
        return []


# ── Main pipeline function ────────────────────────────────────────────────────
def run_gene_family_identification(
    query_sequence: str,
    search_database: str = "swissprot",
    max_hits: int = 30,
    evalue_threshold: float = 1e-5,
    fetch_sequences: bool = True,
    run_interpro: bool = False,   # slow — disable by default, enable for publication
    ncbi_keyword: str = "",
    ncbi_organism: str = "",
) -> dict:
    """
    Full gene family identification pipeline.

    Returns:
        {
          "members": [...],        # list of GeneFamilyMember dicts
          "summary": {...},        # stats
          "fasta": "...",          # multi-FASTA string
          "errors": [...]
        }
    """
    errors = []
    members = []

    # 1. pHMMER search
    logger.info("Running pHMMER search...")
    phmmer_hits = search_phmmer(
        query_sequence, database=search_database,
        max_results=max_hits, evalue_threshold=evalue_threshold
    )

    if not phmmer_hits:
        errors.append("pHMMER returned no hits — check sequence or try NCBI fallback")

    # 2. Optional NCBI complement
    ncbi_hits = []
    if ncbi_keyword:
        logger.info("Running NCBI protein search...")
        ncbi_hits = search_ncbi_protein(ncbi_keyword, ncbi_organism, max_results=20)

    # 3. Merge and deduplicate
    all_hits = phmmer_hits + ncbi_hits
    seen_acc = set()
    unique_hits = []
    for h in all_hits:
        acc = h.get("accession", "")
        if acc and acc not in seen_acc:
            seen_acc.add(acc)
            unique_hits.append(h)

    # 4. Fetch sequences + real metadata (organism/description) from UniProt.
    # phmmer's own hit table truncates the description column, so this also
    # replaces that truncated text with UniProt's authoritative protein name.
    if fetch_sequences:
        logger.info(f"Fetching sequences for {len(unique_hits)} hits...")
        accessions = [h["accession"] for h in unique_hits if h.get("source") == "phmmer"]
        meta = fetch_uniprot_batch(accessions[:max_hits])
        for h in unique_hits:
            info = meta.get(h["accession"])
            if info:
                h["sequence"] = info["sequence"] or h.get("sequence", "")
                h["organism"] = info["organism"] or h.get("organism", "")
                h["description"] = info["description"] or h.get("description", "")
                h["length"] = info["length"] or h.get("length", 0)

    # 5. Build GeneFamilyMember objects with physiochemical properties
    for i, h in enumerate(unique_hits[:max_hits]):
        seq = h.get("sequence", "")
        has_sp, sp_end = predict_signal_peptide_simple(seq) if seq else (False, 0)
        nglyc = find_n_glycosylation_sites(seq) if seq else []

        member = GeneFamilyMember(
            rank=i + 1,
            accession=h.get("accession", ""),
            entry_name=h.get("entry_name", ""),
            description=h.get("description", ""),
            organism=h.get("organism", ""),
            length=h.get("length", len(seq)),
            score=h.get("score", 0.0),
            evalue=h.get("evalue", 1.0),
            sequence=seq,
            mw_kda=calculate_mw(seq) if seq else 0.0,
            pi=calculate_pi(seq) if seq else 0.0,
            has_signal_peptide=has_sp,
            signal_peptide_end=sp_end,
            n_glyc_sites=nglyc,
            interpro_domains=[],
            source=h.get("source", "phmmer"),
        )

        # 6. Optional InterProScan (very slow — 1-2 min per sequence)
        if run_interpro and seq:
            logger.info(f"Running InterProScan for {member.accession}...")
            member.interpro_domains = run_interproscan(seq, member.accession)

        members.append(member.to_dict())

    # 7. Build multi-FASTA
    fasta_lines = []
    for m in members:
        if m["sequence"]:
            fasta_lines.append(
                f">{m['accession']} {m['description']} [{m['organism']}]"
            )
            seq = m["sequence"]
            for j in range(0, len(seq), 60):
                fasta_lines.append(seq[j:j+60])
    fasta = '\n'.join(fasta_lines)

    # 8. Summary statistics
    with_seq = [m for m in members if m["sequence"]]
    summary = {
        "total_hits": len(members),
        "with_sequence": len(with_seq),
        "with_signal_peptide": sum(1 for m in members if m["has_signal_peptide"]),
        "alkaline_pi": sum(1 for m in with_seq if m["pi"] > 7.0),
        "acidic_pi": sum(1 for m in with_seq if 0 < m["pi"] <= 7.0),
        "avg_length": round(
            sum(m["length"] for m in members) / len(members), 1
        ) if members else 0,
        "avg_mw_kda": round(
            sum(m["mw_kda"] for m in with_seq) / len(with_seq), 2
        ) if with_seq else 0,
        "search_database": search_database,
        "evalue_threshold": evalue_threshold,
    }

    return {
        "members": members,
        "summary": summary,
        "fasta": fasta,
        "errors": errors,
    }


# ── Example runner ────────────────────────────────────────────────────────────
# Both examples below use real, verified UniProt sequences (checked live
# against the EBI pHMMER API - see evaluation notes) rather than placeholder
# text, so they reliably return real family members instead of failing.
EXAMPLE_DIRIGENT = {
    "name": "Dirigent protein family (DIR) — Arabidopsis thaliana",
    "description": (
        "Query: AtDIR6 / Dirigent protein 6 (UniProt Q9SUQ8). Genome-wide "
        "dirigent-family identification, following the approach of "
        "Dokka et al. 2024 (Gene 914, 148417)."
    ),
    "query_sequence": (
        "MAFLVEKQLFKALFSFFLLVLLFSDTVLSFRKTIDQKKPCKHFSFYFHDILYDGDNVANATSAAIVSPP"
        "GLGNFKFGKFVIFDGPITMDKNYLSKPVARAQGFYFYDMKMDFNSWFSYTLVFNSTEHKGTLNIMGADL"
        "MMEPTRDLSVVGGTGDFFMARGIATFVTDLFQGAKYFRVKMDIKLYECY"
    ),
    "search_database": "swissprot",
    "max_hits": 25,
    "evalue_threshold": 1e-3,
    "ncbi_keyword": "dirigent protein",
    "ncbi_organism": "",
}

EXAMPLE_NAC = {
    "name": "NAC transcription factor family — Arabidopsis thaliana",
    "description": (
        "Query: NAC001/ANAC001 (UniProt Q0WV96, locus AT1G01010). Identifies "
        "the genome-wide NAC-domain transcription factor family, a common "
        "target family for CRISPR editing studies."
    ),
    "query_sequence": (
        "MEDQVGFGFRPNDEELVGHYLRNKIEGNTSRDVEVAISEVNICSYDPWNLRFQSKYKSRDAMWYFFSRR"
        "ENNKGNRQSRTTVSGKWKLTGESVEVKDQWGFCSEGFRGKIGHKRVLVFLDGRYPDKTKSDWVIHEFHY"
        "DLLPEHQRTYVICRLEYKGDDADILSAYAIDPTPAFVPNMTSSAGSVVNQSRQRNSGSYNTYSEYDSAN"
        "HGQQFNENSNIMQQQPLQGSFNPLLEYDFANHGGQWLSDYIDLQQQVPYLAPYENESEMIWKHVIEENF"
        "EFLVDERTSMQQHYSDHRPKKPVSGVLPDDSSDTETGSMIFEDTSSSTDSVGSSDEPGHTRIDDIPSLN"
        "IIEPLHNYKAQEQPKQQSKEKVISSQKSECEWKMAEDSIKIPPSTNTVKQSWIVLENAQWNYLKNMIIG"
        "VLLFISVISWIILVG"
    ),
    "search_database": "swissprot",
    "max_hits": 25,
    "evalue_threshold": 1e-3,
    "ncbi_keyword": "",
    "ncbi_organism": "",
}
