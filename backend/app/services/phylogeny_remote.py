"""Module: Phylogenetic tree construction — EBI Clustal Omega (alignment)
+ EBI Simple Phylogeny (neighbour-joining/UPGMA tree), both live queries
against the same EBI Job Dispatcher infrastructure already used
elsewhere in this app for pHMMER/InterProScan (see gene_family.py) -
not a from-scratch or fabricated implementation of either algorithm.

Two-step pipeline, matching how these tools are actually meant to be
chained (Simple Phylogeny requires an aligned input; it does not align
raw sequences itself):
  1. POST the raw multi-FASTA to Clustal Omega, poll until FINISHED,
     fetch the aligned FASTA result.
  2. POST that alignment to Simple Phylogeny, poll until FINISHED,
     fetch the Newick tree result.

Result-type identifiers are discovered at runtime via each job's
/resulttypes endpoint rather than hardcoded, since EBI does not
guarantee identical type names forever and guessing wrong would fail
silently rather than loudly.
"""
from __future__ import annotations
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

from app.core.logging import logger

_EBI_BASE = "https://www.ebi.ac.uk/Tools/services/rest"
_EMAIL = "editease-jobs@example.com"  # required by EBI Job Dispatcher, not used to contact anyone
_POLL_INTERVAL_S = 5
_MAX_WAIT_S = 900  # EBI queues can run long; polled asynchronously by our own Celery task

# Four real, reviewed UniProt entries from the Arabidopsis NAC
# transcription factor family, fetched live (rest.uniprot.org) - a real
# gene family, not fabricated placeholder sequences.
EXAMPLE_SEQUENCES = (
    ">Q9CAR0_NAC032\n"
    "MMKSGADLQFPPGFRFHPTDEELVLMYLCRKCASQPIPAPIITELDLYRYDPWDLPDMAL\n"
    "YGEKEWYFFSPRDRKYPNGSRPNRAAGTGYWKATGADKPIGRPKPVGIKKALVFYSGKPP\n"
    "NGEKTNWIMHEYRLADVDRSVRKKNSLRLDDWVLCRIYNKKGVIEKRRSDIEDGLKPVTD\n"
    "TCPPESVARLISGSEQAVSPEFTCSNGRLSNALDFPFNYVDAIADNEIVSRLLGGNQMWS\n"
    "TTLDPLVVRQGTF\n"
    ">Q9LD44_NAC056\n"
    "MESTDSSGGPPPPQPNLPPGFRFHPTDEELVVHYLKRKAASAPLPVAIIAEVDLYKFDPW\n"
    "ELPAKASFGEQEWYFFSPRDRKYPNGARPNRAATSGYWKATGTDKPVLASDGNQKVGVKK\n"
    "ALVFYSGKPPKGVKSDWIMHEYRLIENKPNNRPPGCDFGNKKNSLRLDDWVLCRIYKKNN\n"
    "ASRHVDNDKDHDMIDYIFRKIPPSLSMAAASTGLHQHHHNVSRSMNFFPGKFSGGGYGIF\n"
    "SDGGNTSIYDGGGMINNIGTDSVDHDNNADVVGLNHASSSGPMMMANLKRTLPVPYWPVA\n"
    "DEEQDASPSKRFHGVGGGGGDCSNMSSSMMEETPPLMQQQGGVLGDGLFRTTSYQLPGLN\n"
    "WYSS\n"
    ">O65508_NAC076\n"
    "MESVDQSCSVPPGFRFHPTDEELVGYYLRKKVASQKIDLDVIRDIDLYRIEPWDLQESCR\n"
    "IGYEERNEWYFFSHKDKKYPTGTRTNRATMAGFWKATGRDKAVYDKSKLIGMRKTLVFYK\n"
    "GRAPNGQKTDWIMHEYRLESDENAPPQEEGWVVCRAFKKKPMTGQAKNTETWSSSYFYDE\n"
    "LPSGVRSVTEPLNYVSKQKQNVFAQDLMFKQELEGSDIGLNFIHCDQFIQLPQLESPSLP\n"
    "LTKRPVSLTSITSLEKNKNIYKRHLIEEDVSFNALISSGNKDKKKKKTSVMTTDWRALDK\n"
    "FVASQLMSQEDGVSGFGGHHEEDNNKIGHYNNEESNNKGSVETASSTLLSDREEENRFIS\n"
    "GLLCSNLDYDLYRDLHV\n"
    ">Q9SL41_NAC037\n"
    "MEPMESCSVPPGFRFHPTDEELVGYYLRKKIASQKIDLDVIRDIDLYRIEPWDLQEQCRI\n"
    "GYEEQNEWYFFSHKDKKYPTGTRTNRATMAGFWKATGRDKAVYDKTKLIGMRKTLVFYKG\n"
    "RAPNGKKSDWIMHEYRLESDENAPPQEEGWVVCRAFKKRATGQAKNTETWSSSYFYDEVA\n"
    "PNGVNSVMDPIDYISKQQHNIFGKGLMCKQELEGMVDGINYIQSNQFIQLPQLQSPSLPL\n"
    "MKRPSSSMSITSMDNNYNYKLPLADEESFESFIRGEDRRKKKKQVMMTGNWRELDKFVAS\n"
    "QLMSQEDNGTSSFAGHHIVNEDKNNNDVEMDSSMFLSEREEENRFVSEFLSTNSDYDIGI\n"
    "CVFDN\n"
)


def _get(url: str, **kw) -> requests.Response:
    r = requests.get(url, timeout=30, **kw)
    r.raise_for_status()
    return r


def _submit(tool: str, data: dict) -> str:
    r = requests.post(f"{_EBI_BASE}/{tool}/run", data=data, timeout=30)
    r.raise_for_status()
    job_id = r.text.strip()
    if not job_id or " " in job_id:
        raise RuntimeError(f"Unexpected job id from EBI {tool}: {job_id!r}")
    return job_id


def _poll(tool: str, job_id: str, on_progress=None) -> None:
    waited = 0
    while waited < _MAX_WAIT_S:
        status = _get(f"{_EBI_BASE}/{tool}/status/{job_id}").text.strip()
        if status == "FINISHED":
            return
        if status in ("ERROR", "FAILURE", "NOT_FOUND"):
            raise RuntimeError(f"EBI {tool} job {job_id} ended with status {status}")
        if on_progress:
            on_progress(status)
        time.sleep(_POLL_INTERVAL_S)
        waited += _POLL_INTERVAL_S
    raise TimeoutError(f"EBI {tool} job {job_id} did not finish within {_MAX_WAIT_S}s")


def _discover_result_type(tool: str, job_id: str, prefer_keywords: list[str]) -> str:
    """Fetch the real list of available result identifiers for a finished
    job and pick the one whose description best matches what we want,
    instead of assuming a hardcoded identifier that might not exist.
    """
    r = _get(f"{_EBI_BASE}/{tool}/resulttypes/{job_id}")
    root = ET.fromstring(r.text)
    ns = {"ns": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {}
    types = root.findall(".//ns:type", ns) if ns else root.findall(".//type")
    candidates = []
    for t in types:
        ident_el = t.find("ns:identifier", ns) if ns else t.find("identifier")
        desc_el = t.find("ns:description", ns) if ns else t.find("description")
        ident = ident_el.text if ident_el is not None else None
        desc = (desc_el.text or "") if desc_el is not None else ""
        if ident:
            candidates.append((ident, desc.lower()))
    for kw in prefer_keywords:
        for ident, desc in candidates:
            if kw in ident.lower() or kw in desc:
                return ident
    if candidates:
        return candidates[0][0]
    raise RuntimeError(f"No result types available for {tool} job {job_id}")


def run_clustal_omega(fasta_text: str, on_progress=None) -> str:
    """Submit a multi-FASTA to EBI Clustal Omega and return the aligned
    FASTA once finished.
    """
    job_id = _submit("clustalo", {
        "email": _EMAIL, "sequence": fasta_text, "outfmt": "fa",
    })
    logger.info(f"Clustal Omega job submitted: {job_id}")
    _poll("clustalo", job_id, on_progress)
    result_type = _discover_result_type("clustalo", job_id, ["fasta", "aln-fa"])
    return _get(f"{_EBI_BASE}/clustalo/result/{job_id}/{result_type}").text


def run_simple_phylogeny(aligned_fasta: str, on_progress=None) -> str:
    """Submit an aligned FASTA to EBI Simple Phylogeny and return the
    resulting Newick tree once finished.
    """
    job_id = _submit("simple_phylogeny", {
        "email": _EMAIL, "sequence": aligned_fasta,
        "tree": "nj", "clustering": "nj",
    })
    logger.info(f"Simple Phylogeny job submitted: {job_id}")
    _poll("simple_phylogeny", job_id, on_progress)
    result_type = _discover_result_type("simple_phylogeny", job_id, ["tree", "newick", "phylotree"])
    return _get(f"{_EBI_BASE}/simple_phylogeny/result/{job_id}/{result_type}").text


def build_phylogeny(fasta_text: str, job_dir: Path, on_progress=None) -> dict:
    """Full pipeline: align with Clustal Omega, then build a tree with
    Simple Phylogeny. Both steps are real live EBI queries; nothing here
    is computed locally or approximated.
    """
    if on_progress:
        on_progress("aligning")
    alignment = run_clustal_omega(fasta_text, on_progress)
    (job_dir / "alignment.fasta").write_text(alignment)

    if on_progress:
        on_progress("building tree")
    newick = run_simple_phylogeny(alignment, on_progress)
    (job_dir / "tree.nwk").write_text(newick)

    return {
        "alignment": alignment,
        "newick": newick,
        "files": {
            "alignment_fasta": str(job_dir / "alignment.fasta"),
            "newick": str(job_dir / "tree.nwk"),
        },
    }
