"""
Conserved Motif Analysis Service (MEME) — BioNexus Tool GF-3
Identifies conserved protein motifs across a gene family using:
  - MEME Suite REST API (meme-suite.org)
  - Local fallback: pure-Python k-mer frequency motif finder
  - MAST for motif scanning across all sequences

Methodology mirrors Dokka et al. 2024 (10 motifs in 25 CcDIR proteins).
"""

import re
import time
import math
import logging
import requests
import itertools
from collections import Counter
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)

# ── MEME Suite REST API endpoints ─────────────────────────────────────────────
# NOTE (verified live): meme-suite.org has no plain-form REST submission -
# POSTing here just returns the human web submission form's HTML, never a
# job ID, so submit_to_meme_api() below always returns None and every real
# request silently falls through to local_motif_finder(). EBI's job-dispatcher
# REST API (the same pattern that works for pHMMER/InterProScan elsewhere in
# this codebase) also has no "meme"/"mast"/"fimo"/"streme" tool registered
# (confirmed: /Tools/services/rest/meme/parameters -> 400 "Tool not found").
# Kept for reference / future replacement; local_motif_finder is the only
# currently-functional path.
MEME_SUBMIT  = "https://meme-suite.org/meme/opal2/services/MEME"
MEME_STATUS  = "https://meme-suite.org/meme/opal2/services/MEME/{job_id}"
MAST_SUBMIT  = "https://meme-suite.org/meme/opal2/services/MAST"
EBI_MEME     = "https://www.ebi.ac.uk/Tools/services/rest/meme/run"

HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}


# ── Dataclasses ───────────────────────────────────────────────────────────────
@dataclass
class Motif:
    motif_id: str           # e.g. "motif_1"
    rank: int
    width: int
    consensus: str          # most likely sequence
    pvalue: float
    evalue: float
    nsites: int             # number of occurrences
    information_content: float = 0.0
    pwm: list = field(default_factory=list)      # position weight matrix
    logo_data: list = field(default_factory=list) # per-position letter heights
    description: str = ""

    def to_dict(self):
        return asdict(self)


@dataclass
class MotifOccurrence:
    sequence_id: str
    motif_id: str
    start: int
    end: int
    strand: str
    pvalue: float
    matched_seq: str

    def to_dict(self):
        return asdict(self)


# ── MEME REST API submission ───────────────────────────────────────────────────
def submit_to_meme_api(sequences_fasta: str,
                        nmotifs: int = 10,
                        minw: int = 6,
                        maxw: int = 50,
                        mod: str = "zoops",
                        maxiter: int = 50,
                        email: str = "editease@research.org") -> Optional[str]:
    """
    Submit sequences to MEME Suite REST API.
    mod options: 'zoops' (zero or one per seq), 'oops', 'anr'

    Returns job_id or None on failure.
    """
    payload = {
        "sequences": sequences_fasta,
        "email": email,
        "nmotifs": nmotifs,
        "minw": minw,
        "maxw": maxw,
        "mod": mod,
        "maxiter": maxiter,
        "revcomp": False,
        "alphabet": "protein",
    }
    try:
        resp = requests.post(
            "https://meme-suite.org/meme/tools/meme",
            data={
                "sequences": sequences_fasta,
                "email": email,
                "nmotifs": str(nmotifs),
                "minw": str(minw),
                "maxw": str(maxw),
                "mod": mod,
            },
            timeout=30
        )
        if resp.status_code in (200, 302):
            # Extract job ID from response or redirect URL
            job_id = None
            if "job_id" in resp.text.lower():
                match = re.search(r'job_?id["\s:=]+([A-Za-z0-9_-]+)', resp.text, re.I)
                if match:
                    job_id = match.group(1)
            return job_id
    except Exception as e:
        logger.warning(f"MEME API submission failed: {e}")
    return None


def poll_meme_results(job_id: str, max_wait: int = 300) -> Optional[str]:
    """Poll MEME job until completion. Returns result text or None."""
    result_url = f"https://meme-suite.org/meme/opal2/services/MEME/{job_id}/results/meme.txt"
    for _ in range(max_wait // 10):
        time.sleep(10)
        try:
            resp = requests.get(result_url, timeout=20)
            if resp.status_code == 200 and "MEME version" in resp.text:
                return resp.text
        except Exception:
            pass
    return None


# ── MEME output parser ────────────────────────────────────────────────────────
def parse_meme_text_output(meme_text: str) -> list[Motif]:
    """
    Parse MEME plain text output file into Motif objects.
    Handles MEME version 4 and 5 output format.
    """
    motifs = []
    current_motif = None
    in_pwm = False
    pwm_rows = []

    lines = meme_text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Detect new motif block
        if line.startswith("MOTIF"):
            if current_motif and pwm_rows:
                current_motif.pwm = pwm_rows
                current_motif.consensus = _pwm_to_consensus(pwm_rows)
                current_motif.logo_data = _pwm_to_logo(pwm_rows)
                current_motif.information_content = _pwm_ic(pwm_rows)
            parts = line.split()
            motif_id = parts[1] if len(parts) > 1 else f"motif_{len(motifs)+1}"
            current_motif = Motif(
                motif_id=motif_id,
                rank=len(motifs) + 1,
                width=0,
                consensus="",
                pvalue=1.0,
                evalue=1.0,
                nsites=0,
            )
            pwm_rows = []
            in_pwm = False
            i += 1
            continue

        # Parse width, sites, p-value from summary line
        if current_motif and "width" in line.lower() and "sites" in line.lower():
            w_match = re.search(r'width\s*=\s*(\d+)', line, re.I)
            s_match = re.search(r'sites\s*=\s*(\d+)', line, re.I)
            p_match = re.search(r'[ep]-value\s*=\s*([0-9.e+\-]+)', line, re.I)
            e_match = re.search(r'e-value\s*=\s*([0-9.e+\-]+)', line, re.I)
            if w_match:
                current_motif.width = int(w_match.group(1))
            if s_match:
                current_motif.nsites = int(s_match.group(1))
            if p_match:
                try:
                    current_motif.pvalue = float(p_match.group(1))
                except:
                    pass
            if e_match:
                try:
                    current_motif.evalue = float(e_match.group(1))
                except:
                    pass

        # Detect PWM section
        if "letter-probability matrix" in line.lower():
            in_pwm = True
            i += 1
            continue

        # Parse PWM rows
        if in_pwm and current_motif:
            nums = re.findall(r'[0-9]+\.[0-9]+', line)
            if len(nums) == 20:  # 20 amino acids
                pwm_rows.append([float(x) for x in nums])
            elif not line or line.startswith("MOTIF") or line.startswith("---"):
                if line.startswith("MOTIF"):
                    in_pwm = False
                    if current_motif and pwm_rows:
                        current_motif.pwm = pwm_rows
                        current_motif.consensus = _pwm_to_consensus(pwm_rows)
                        current_motif.logo_data = _pwm_to_logo(pwm_rows)
                        current_motif.information_content = _pwm_ic(pwm_rows)
                        motifs.append(current_motif)
                        current_motif = None
                    pwm_rows = []
                    i -= 1

        i += 1

    # Save last motif
    if current_motif:
        if pwm_rows:
            current_motif.pwm = pwm_rows
            current_motif.consensus = _pwm_to_consensus(pwm_rows)
            current_motif.logo_data = _pwm_to_logo(pwm_rows)
            current_motif.information_content = _pwm_ic(pwm_rows)
        motifs.append(current_motif)

    return motifs


# ── PWM utilities ─────────────────────────────────────────────────────────────
AA_ORDER = list("ACDEFGHIKLMNPQRSTVWY")

def _pwm_to_consensus(pwm: list[list[float]]) -> str:
    """Get consensus sequence from PWM (highest probability AA at each position)."""
    if not pwm:
        return ""
    return ''.join(AA_ORDER[row.index(max(row))] for row in pwm)


def _pwm_to_logo(pwm: list[list[float]]) -> list[dict]:
    """
    Generate sequence logo data: per-position letter heights.
    Height = IC * probability (bits).
    """
    logo = []
    for pos, row in enumerate(pwm):
        total = sum(row)
        probs = [p / total if total > 0 else 0 for p in row]
        # Information content at this position
        ic = math.log2(20) + sum(p * math.log2(p) if p > 0 else 0 for p in probs)
        ic = max(0, ic)
        letters = []
        sorted_pairs = sorted(zip(AA_ORDER, probs), key=lambda x: x[1])
        for aa, prob in sorted_pairs:
            if prob > 0.01:
                letters.append({"aa": aa, "height": round(ic * prob, 4), "prob": round(prob, 4)})
        logo.append({"position": pos + 1, "ic": round(ic, 4), "letters": letters})
    return logo


def _pwm_ic(pwm: list[list[float]]) -> float:
    """Total information content (bits) of PWM."""
    total_ic = 0.0
    for row in pwm:
        s = sum(row)
        probs = [p / s if s > 0 else 0 for p in row]
        ic = math.log2(20) + sum(p * math.log2(p) if p > 0 else 0 for p in probs)
        total_ic += max(0, ic)
    return round(total_ic, 3)


# ── Local motif finder (fallback when MEME API unavailable) ───────────────────
def local_motif_finder(sequences: dict[str, str],
                        nmotifs: int = 10,
                        min_width: int = 8,
                        max_width: int = 30,
                        min_support: float = 0.5) -> list[Motif]:
    """
    Pure-Python motif finder using k-mer frequency approach.
    Less powerful than MEME but fully offline.

    Uses consensus-based approach:
    1. Find most frequent k-mers across sequences
    2. Build consensus and compute simple PWM
    3. Rank by frequency × conservation
    """
    if not sequences:
        return []

    seqs = list(sequences.values())
    n_seqs = len(seqs)
    motifs_found = []

    for width in range(min_width, min(max_width + 1, 25), 3):
        kmer_counts = Counter()
        kmer_sources = {}

        for seq_id, seq in sequences.items():
            seq = seq.upper()
            seen_kmers = set()
            for i in range(len(seq) - width + 1):
                kmer = seq[i:i + width]
                if 'X' in kmer or 'B' in kmer or 'Z' in kmer:
                    continue
                kmer_counts[kmer] += 1
                if kmer not in seen_kmers:
                    kmer_sources.setdefault(kmer, set()).add(seq_id)
                    seen_kmers.add(kmer)

        # Filter by support (present in >= min_support fraction of sequences)
        supported = {k: v for k, v in kmer_counts.items()
                     if len(kmer_sources.get(k, set())) / n_seqs >= min_support}

        if not supported:
            continue

        # Get top kmer for this width
        top_kmer = max(supported, key=supported.get)
        support_fraction = len(kmer_sources.get(top_kmer, set())) / n_seqs

        # Build simple PWM from all occurrences
        pwm = _build_pwm_from_kmer(top_kmer, sequences)

        motif = Motif(
            motif_id=f"motif_{len(motifs_found) + 1}",
            rank=len(motifs_found) + 1,
            width=width,
            consensus=top_kmer,
            pvalue=round(1.0 / max(supported[top_kmer], 1), 6),
            evalue=round(1.0 / max(supported[top_kmer], 1) * n_seqs, 6),
            nsites=supported[top_kmer],
            pwm=pwm,
            logo_data=_pwm_to_logo(pwm),
            information_content=_pwm_ic(pwm),
            description=f"Found in {len(kmer_sources.get(top_kmer, set()))}/{n_seqs} sequences",
        )
        motifs_found.append(motif)

        if len(motifs_found) >= nmotifs:
            break

    return sorted(motifs_found, key=lambda m: m.pvalue)[:nmotifs]


def _build_pwm_from_kmer(consensus: str, sequences: dict[str, str]) -> list[list[float]]:
    """Build PWM from all occurrences of a consensus-like kmer."""
    width = len(consensus)
    counts = [[0.0] * 20 for _ in range(width)]
    total = 0

    for seq in sequences.values():
        seq = seq.upper()
        for i in range(len(seq) - width + 1):
            kmer = seq[i:i + width]
            match_score = sum(1 for a, b in zip(kmer, consensus) if a == b)
            if match_score >= width * 0.7:  # 70% match threshold
                for pos, aa in enumerate(kmer):
                    if aa in AA_ORDER:
                        counts[pos][AA_ORDER.index(aa)] += 1
                        total += 1

    # Normalize with pseudocounts
    pwm = []
    for row in counts:
        row_sum = sum(row) + 20 * 0.1  # pseudocount
        pwm.append([round((x + 0.1) / row_sum, 4) for x in row])

    return pwm


# ── Motif distribution matrix ─────────────────────────────────────────────────
def build_motif_distribution(
    sequences: dict[str, str],
    motifs: list[Motif],
    pvalue_threshold: float = 1e-3,
) -> dict:
    """
    Scan all sequences for all motifs (MAST-like).
    Returns presence/absence matrix and occurrence positions.

    Format:
    {
      "matrix": {seq_id: {motif_id: [occurrences]}},
      "presence": {seq_id: [motif_ids_present]},
      "heatmap": [[bool, ...], ...],  # for visualization
    }
    """
    matrix = {}
    presence = {}

    for seq_id, seq in sequences.items():
        seq = seq.upper()
        matrix[seq_id] = {}
        presence[seq_id] = []

        for motif in motifs:
            occurrences = []
            consensus = motif.consensus

            if not consensus:
                continue

            # Scan for consensus with up to 2 mismatches
            for i in range(len(seq) - len(consensus) + 1):
                window = seq[i:i + len(consensus)]
                mismatches = sum(1 for a, b in zip(window, consensus) if a != b)
                if mismatches <= 2:
                    occurrences.append({
                        "start": i + 1,
                        "end": i + len(consensus),
                        "matched_seq": window,
                        "mismatches": mismatches,
                        "pvalue": motif.pvalue * (3 ** mismatches),
                    })

            matrix[seq_id][motif.motif_id] = occurrences
            if occurrences:
                presence[seq_id].append(motif.motif_id)

    # Build heatmap matrix (rows=sequences, cols=motifs)
    seq_ids = list(sequences.keys())
    motif_ids = [m.motif_id for m in motifs]
    heatmap = []
    for seq_id in seq_ids:
        row = [bool(matrix.get(seq_id, {}).get(mid, [])) for mid in motif_ids]
        heatmap.append({"seq_id": seq_id, "presence": row})

    return {
        "matrix": matrix,
        "presence": presence,
        "heatmap": heatmap,
        "seq_ids": seq_ids,
        "motif_ids": motif_ids,
    }


# ── Main pipeline function ────────────────────────────────────────────────────
def run_motif_analysis(
    sequences: dict[str, str],
    nmotifs: int = 10,
    min_width: int = 6,
    max_width: int = 50,
    use_meme_api: bool = True,
    mod: str = "zoops",
) -> dict:
    """
    Full motif analysis pipeline.

    Args:
        sequences: dict {sequence_id: protein_sequence}
        nmotifs: number of motifs to find
        use_meme_api: try MEME Suite REST API first
        mod: MEME model (zoops/oops/anr)

    Returns:
        {
          "motifs": [...],
          "distribution": {...},
          "fasta_used": "...",
          "method": "meme_api" | "local",
          "errors": [...]
        }
    """
    errors = []
    motifs = []
    method = "local"

    # Build FASTA string
    fasta_lines = []
    for sid, seq in sequences.items():
        fasta_lines.append(f">{sid}")
        for i in range(0, len(seq), 60):
            fasta_lines.append(seq[i:i+60])
    fasta = '\n'.join(fasta_lines)

    # 1. Try MEME API
    if use_meme_api and len(sequences) >= 2:
        logger.info("Submitting to MEME Suite REST API...")
        try:
            job_id = submit_to_meme_api(
                fasta, nmotifs=nmotifs, minw=min_width, maxw=max_width, mod=mod
            )
            if job_id:
                logger.info(f"MEME job submitted: {job_id}")
                result_text = poll_meme_results(job_id)
                if result_text:
                    motifs = parse_meme_text_output(result_text)
                    method = "meme_api"
                else:
                    errors.append("MEME API timed out — falling back to local finder")
            else:
                errors.append("MEME API did not return job ID — using local finder")
        except Exception as e:
            errors.append(f"MEME API error: {e} — using local finder")

    # 2. Local fallback
    if not motifs:
        logger.info("Running local motif finder...")
        motifs = local_motif_finder(
            sequences, nmotifs=nmotifs,
            min_width=min_width, max_width=min(max_width, 25)
        )
        method = "local"
        if not motifs:
            errors.append("Local motif finder found no significant motifs")

    # 3. Build distribution matrix
    distribution = {}
    if motifs:
        distribution = build_motif_distribution(sequences, motifs)

    return {
        "motifs": [m.to_dict() for m in motifs],
        "distribution": distribution,
        "fasta_used": fasta,
        "method": method,
        "n_sequences": len(sequences),
        "n_motifs_found": len(motifs),
        "errors": errors,
    }


# ── Example data ──────────────────────────────────────────────────────────────
# Real UniProt sequences for the dirigent (DIR) protein family - the same
# family validated end-to-end in the Gene Family (GF-1) module - rather than
# placeholder text, so this reliably finds real conserved motifs instead of
# failing on invalid residues.
EXAMPLE_MEME = {
    "name": "Dirigent (DIR) protein family motif analysis",
    "description": (
        "Conserved motif discovery across 8 real dirigent-family proteins "
        "(Arabidopsis thaliana, Sinopodophyllum hexandrum, Pisum sativum), "
        "following the approach of Dokka et al. 2024 (Gene 914, 148417)."
    ),
    "sequences": {
        "DIR6_ARATH_Q9SUQ8": "MAFLVEKQLFKALFSFFLLVLLFSDTVLSFRKTIDQKKPCKHFSFYFHDILYDGDNVANATSAAIVSPPGLGNFKFGKFVIFDGPITMDKNYLSKPVARAQGFYFYDMKMDFNSWFSYTLVFNSTEHKGTLNIMGADLMMEPTRDLSVVGGTGDFFMARGIATFVTDLFQGAKYFRVKMDIKLYECY",
        "DIR5_ARATH_Q9SH66": "MVGQMKSFLFLFVFLVLTKTVISARKPSKSQPKPCKNFVLYYHDIMFGVDDVQNATSAAVTNPPGLGNFKFGKLVIFDDPMTIDKNFQSEPVARAQGFYFYDMKNDYNAWFAYTLVFNSTQHKGTLNIMGADLMMVQSRDLSVVGGTGDFFMSRGIVTFETDTFEGAKYFRVKMDIKLYECY",
        "DIR13_ARATH_Q9T017": "MANQIYIISLIFLSVLLYQSTTVLSFRQPFNLAKPCKRFVFYLHNVAYDGDNTDNATSAAIVNPLGLGDFSFGKFVIMDNPVTMDQNMLSEQVARVQGFFFYHGKTKYDTWLSWSVVFNSTQHKGALNIMGENAFMEPTRDLPVVGGTGDFVMTRGIATFMTDLVEGSKYFRVKMDIKLYECYY",
        "DIR12_ARATH_O82498": "MTNQIYKQVFSFFLSVLLLQSSTVSYVPKSFDLKKPCKHFVLYLHNIAYDGDNAANATAATIVKPLGLGDHSFGELIIINNPVTLDQNYLSKPVARAQGFYFYNMKTNYNAWVAWTLVFNSTKHKGTFTIMDANPFGLQPARDLSIVGGTGDFLMTRGIATFKTKLTQGSKYFCVEMNIKLYECY",
        "DIR14_ARATH_Q9T019": "MANQIYLFSLICLSVLLCQSYTVSSFQKSLDLAKPCKRFVLHLHDIAYDGDNAANATSAAIVNPLGLGDFSFGKFVIMDDPVTMDQNYLSKPVARVQGFFCYHGKATYDAWIAWTVVFNSTQHKGAFTIMGENPFMEPTRDLPIVGGTGDFIMTRGIATLTTDHIDGSKYFRVKLDIKLYECYH",
        "DIR_SINHE_Q1ZZU9": "MGGEKAFSFIFLLFLCFFLANLSASSAHPPRQKLKQRIPCKQLVLYFHDVVYNGHNKANATASIVGAPQGADLVKLAGENHFGNVVVFDDPITLDNNFHSPPVGRAQGLYVYDKKDTFHSWLSFSFTLNTTMHQGTLIFMGADPILIKNRDITVVGGTGDFFMARGIATIATDSYEGEVYFRLKVDIKLYECW",
        "DR206_PEA_P13240": "MGSKLLVLFVFVMLFALSSAIPNKRKPYKPCKNLVFYFHDILYNGKNAANATSAIVAAPEGVSLTKLAPQSHFGNIIVFDDPITLSHSLSSKQVGRAQGFYIYDTKNTYTSWLSFTFVLNSTHHQGTITFAGADPIVAKTRDISVTGGTGDFFMHRGIATITTDAFEGEAYFRLGVYIKFFECW",
        "DIR1_ARATH_Q9FIG6": "MAKRFLLLLPLLSSILLLAVSVTAYSTTTPYQGYKPEKFTHLHFYFHDVISGDKPTAVKVAEARPTTTLNVKFGVIMIADDPLTEGPDPSSKEVGRAQGMYASTAMKDIVFTMVFNYVFTAGEFNGSTIAVYGRNDIFSKVRELPIIGGTGAFRFARGYALPKTYKIVGLDAVVEYNVFIWH",
    },
    "nmotifs": 10,
    "min_width": 6,
    "max_width": 50,
}
