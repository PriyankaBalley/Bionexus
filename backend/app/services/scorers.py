"""Efficiency / structural scorers used by the sgRNA design pipeline.

All scorers are deterministic, dependency-free approximations that follow
trends established by published models. For research-grade accuracy install
ViennaRNA (RNAfold) and the original `azimuth` / Moreno-Mateos models and
swap in the appropriate adapter.
"""
from __future__ import annotations
import re
from Bio.Seq import Seq


# ── Doench Rule Set 2 (approximation) ────────────────────────────────────────
def doench_score(guide: str) -> float:
    g = guide.upper()
    n = len(g) or 1
    score = 1.0
    gc = (g.count("G") + g.count("C")) / n
    if gc < 0.40 or gc > 0.65:
        score -= min(0.4, abs(gc - 0.55) * 1.2)
    if "TTTT" in g: score -= 0.30
    if "GGGGG" in g or "CCCCC" in g: score -= 0.15
    if g[-1] == "G": score += 0.05
    if g[0] == "T": score -= 0.05
    seed = g[-8:]
    seed_gc = (seed.count("G") + seed.count("C")) / 8
    if 0.3 <= seed_gc <= 0.7: score += 0.05
    return max(0.0, min(1.0, score))


# ── Moreno-Mateos (approximation) ────────────────────────────────────────────
# The Moreno-Mateos model favors high GC in the seed and penalizes T at PAM-1
def moreno_mateos_score(guide: str) -> float:
    g = guide.upper()
    n = len(g) or 1
    gc = (g.count("G") + g.count("C")) / n
    score = 0.5
    score += 0.4 * (1.0 - abs(gc - 0.65) * 2)   # peak around 65%
    seed_gc = (g[-6:].count("G") + g[-6:].count("C")) / 6
    score += 0.15 * (seed_gc - 0.5)
    if g[-2] == "T": score -= 0.10
    if g[-1] == "G": score += 0.05
    if "TTTT" in g: score -= 0.20
    return max(0.0, min(1.0, score))


# ── CRISPRater (Labuhn 2018, simplified) ─────────────────────────────────────
# Uses position-specific GC weighting and global GC penalty
def crisprater_score(guide: str) -> float:
    g = guide.upper()
    if not g:
        return 0.0
    weights_5 = [0.05, 0.05, 0.05, 0.05, 0.10, 0.10, 0.10]   # 5' nt 1-7
    weights_seed = [0.10, 0.15, 0.15, 0.15, 0.10, 0.10]      # seed nt 14-19
    score = 0.5
    for i, w in enumerate(weights_5):
        if i < len(g) and g[i] in "GC":
            score += w * 0.05
    seed = g[-len(weights_seed):]
    for i, w in enumerate(weights_seed):
        if i < len(seed) and seed[i] in "GC":
            score += w * 0.10
    gc = (g.count("G") + g.count("C")) / len(g)
    if gc < 0.30 or gc > 0.80:
        score -= 0.25
    if "TTTT" in g: score -= 0.15
    return max(0.0, min(1.0, score))


# ── Combined efficiency ──────────────────────────────────────────────────────
def combined_efficiency(guide: str) -> dict[str, float]:
    d = doench_score(guide)
    m = moreno_mateos_score(guide)
    c = crisprater_score(guide)
    combined = round(0.45 * d + 0.30 * m + 0.25 * c, 4)
    return {
        "doench":         round(d, 4),
        "moreno_mateos":  round(m, 4),
        "crisprater":     round(c, 4),
        "combined":       combined,
    }


# ── Self-complementarity ─────────────────────────────────────────────────────
def self_complementarity_score(guide: str) -> float:
    """Lower is better. We return 1 - normalized_pal so it's a 'higher is better' score."""
    g = guide.upper()
    if len(g) < 4:
        return 1.0
    rc = str(Seq(g).reverse_complement())
    # Longest matching contiguous substring between guide and its rc
    longest = 0
    for i in range(len(g)):
        for j in range(i + 4, len(g) + 1):
            if g[i:j] in rc:
                longest = max(longest, j - i)
    pal = longest / len(g)
    return round(max(0.0, 1.0 - pal), 4)


# ── Restriction sites ────────────────────────────────────────────────────────
COMMON_ENZYMES: dict[str, str] = {
    "EcoRI":   "GAATTC",
    "BamHI":   "GGATCC",
    "HindIII": "AAGCTT",
    "NotI":    "GCGGCCGC",
    "XhoI":    "CTCGAG",
    "SalI":    "GTCGAC",
    "PstI":    "CTGCAG",
    "KpnI":    "GGTACC",
    "SacI":    "GAGCTC",
    "SpeI":    "ACTAGT",
    "NheI":    "GCTAGC",
    "XbaI":    "TCTAGA",
    "NcoI":    "CCATGG",
    "BglII":   "AGATCT",
    "ClaI":    "ATCGAT",
    "MluI":    "ACGCGT",
    "PvuI":    "CGATCG",
    "SmaI":    "CCCGGG",
    "ApaI":    "GGGCCC",
    "BsaI":    "GGTCTC",
    "BsmBI":   "CGTCTC",
    "AarI":    "CACCTGC",
    "SapI":    "GCTCTTC",
    "BsaXI":   "ACNNNNNCTCC",
    "AvrII":   "CCTAGG",
    "PacI":    "TTAATTAA",
    "AscI":    "GGCGCGCC",
    "FseI":    "GGCCGGCC",
    "SbfI":    "CCTGCAGG",
}


def find_restriction_sites(guide_with_pam: str) -> list[str]:
    """Return list of enzyme names whose recognition sites are present in guide+PAM."""
    g = guide_with_pam.upper()
    hits: list[str] = []
    for enzyme, site in COMMON_ENZYMES.items():
        if "N" in site:
            pattern = site.replace("N", "[ACGT]")
            if re.search(pattern, g):
                hits.append(enzyme)
        elif site in g:
            hits.append(enzyme)
    return hits


# ── CRISPR mode positional weighting ─────────────────────────────────────────
def mode_position_weight(start: int, end: int, seq_length: int, mode: str) -> float:
    """Apply mode-specific positional preference.
    - knockout: prefer 5' half of CDS (early disruption)
    - crispri: target window TSS+50..TSS+500 (assume TSS at end of input)
    - crispra: target window TSS-400..TSS-50 (upstream of TSS)
    Returns a multiplier in [0.5, 1.5].
    """
    if seq_length <= 0:
        return 1.0
    mid = (start + end) / 2
    rel = mid / seq_length

    if mode == "knockout":
        # Favor first 60% of sequence
        if rel <= 0.6:
            return 1.0 + (0.6 - rel) * 0.3
        return max(0.7, 1.0 - (rel - 0.6) * 0.5)

    if mode == "crispri":
        # Favor mid-region (transcription elongation block)
        if 0.3 <= rel <= 0.8:
            return 1.2
        return 0.8

    if mode == "crispra":
        # Favor 5' upstream region
        if rel <= 0.4:
            return 1.3
        return 0.7

    return 1.0
