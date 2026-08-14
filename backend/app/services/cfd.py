"""
Cutting Frequency Determination (CFD) score — Doench et al. 2016.

The CFD score quantifies the predicted activity of an sgRNA at an off-target
site, given the specific mismatches between the sgRNA and the off-target.
A CFD of 1.0 means the off-target is as efficiently cut as the on-target;
a CFD of 0.0 means no cutting is predicted.

For multiple off-targets, the aggregate specificity score is:
    100 / (100 + sum(CFD_i for all off-targets))
which approaches 100 when there are no problematic off-targets, and decreases
as off-targets accumulate. This is the metric reported by CRISPOR.

Citation:
    Doench JG, Fusi N, Sullender M, et al.
    "Optimized sgRNA design to maximize activity and minimize off-target
    effects of CRISPR-Cas9." Nat Biotechnol 34, 184-191 (2016).

Mismatch tables source:
    Doench 2016 Supplementary Table 19; redistributed in CRISPOR
    (Apache 2.0; https://github.com/maximilianh/crisporWebsite).
"""
from __future__ import annotations
from Bio.Seq import Seq

# Mismatch penalty: position 1..20 in the protospacer (1-indexed),
# (sgRNA_base, target_base) -> activity preserved (0..1)
# Only mismatches that have nonzero activity are listed; unlisted = 0
_MM_SCORES: dict[tuple[int, str, str], float] = {
    # Position 1
    (1, 'U', 'C'): 0.857142857, (1, 'U', 'G'): 0.857142857, (1, 'U', 'U'): 1.0,
    (1, 'C', 'A'): 1.0, (1, 'C', 'C'): 1.0, (1, 'C', 'U'): 1.0,
    (1, 'A', 'A'): 1.0, (1, 'A', 'C'): 1.0, (1, 'A', 'G'): 1.0,
    (1, 'G', 'A'): 1.0, (1, 'G', 'G'): 1.0, (1, 'G', 'U'): 1.0,
    # Position 2
    (2, 'U', 'C'): 0.785714286, (2, 'U', 'G'): 0.785714286, (2, 'U', 'U'): 0.727272727,
    (2, 'C', 'A'): 0.727272727, (2, 'C', 'C'): 0.722222222, (2, 'C', 'U'): 0.8,
    (2, 'A', 'A'): 0.727272727, (2, 'A', 'C'): 0.8, (2, 'A', 'G'): 0.846153846,
    (2, 'G', 'A'): 0.846153846, (2, 'G', 'G'): 0.928571429, (2, 'G', 'U'): 0.857142857,
    # Position 3
    (3, 'U', 'C'): 0.428571429, (3, 'U', 'G'): 0.428571429, (3, 'U', 'U'): 0.866666667,
    (3, 'C', 'A'): 0.866666667, (3, 'C', 'C'): 0.5, (3, 'C', 'U'): 0.5,
    (3, 'A', 'A'): 0.5, (3, 'A', 'C'): 0.5, (3, 'A', 'G'): 0.555555556,
    (3, 'G', 'A'): 0.555555556, (3, 'G', 'G'): 0.428571429, (3, 'G', 'U'): 0.857142857,
    # Position 4
    (4, 'U', 'C'): 0.0, (4, 'U', 'G'): 0.0, (4, 'U', 'U'): 0.6,
    (4, 'C', 'A'): 0.6, (4, 'C', 'C'): 0.0, (4, 'C', 'U'): 0.5,
    (4, 'A', 'A'): 0.0, (4, 'A', 'C'): 0.5, (4, 'A', 'G'): 0.6,
    (4, 'G', 'A'): 0.6, (4, 'G', 'G'): 0.0, (4, 'G', 'U'): 0.5,
    # Position 5
    (5, 'U', 'C'): 0.642857143, (5, 'U', 'G'): 0.642857143, (5, 'U', 'U'): 0.866666667,
    (5, 'C', 'A'): 0.866666667, (5, 'C', 'C'): 0.6, (5, 'C', 'U'): 0.866666667,
    (5, 'A', 'A'): 0.6, (5, 'A', 'C'): 0.866666667, (5, 'A', 'G'): 0.692307692,
    (5, 'G', 'A'): 0.692307692, (5, 'G', 'G'): 0.785714286, (5, 'G', 'U'): 0.857142857,
    # Position 6
    (6, 'U', 'C'): 0.555555556, (6, 'U', 'G'): 0.555555556, (6, 'U', 'U'): 0.6,
    (6, 'C', 'A'): 0.6, (6, 'C', 'C'): 0.466666667, (6, 'C', 'U'): 0.583333333,
    (6, 'A', 'A'): 0.466666667, (6, 'A', 'C'): 0.583333333, (6, 'A', 'G'): 0.692307692,
    (6, 'G', 'A'): 0.692307692, (6, 'G', 'G'): 0.642857143, (6, 'G', 'U'): 0.928571429,
    # Position 7
    (7, 'U', 'C'): 0.176470588, (7, 'U', 'G'): 0.176470588, (7, 'U', 'U'): 0.466666667,
    (7, 'C', 'A'): 0.466666667, (7, 'C', 'C'): 0.176470588, (7, 'C', 'U'): 0.235294118,
    (7, 'A', 'A'): 0.176470588, (7, 'A', 'C'): 0.235294118, (7, 'A', 'G'): 0.428571429,
    (7, 'G', 'A'): 0.428571429, (7, 'G', 'G'): 0.214285714, (7, 'G', 'U'): 0.461538462,
    # Position 8
    (8, 'U', 'C'): 0.428571429, (8, 'U', 'G'): 0.428571429, (8, 'U', 'U'): 0.65,
    (8, 'C', 'A'): 0.65, (8, 'C', 'C'): 0.428571429, (8, 'C', 'U'): 0.428571429,
    (8, 'A', 'A'): 0.428571429, (8, 'A', 'C'): 0.428571429, (8, 'A', 'G'): 0.642857143,
    (8, 'G', 'A'): 0.642857143, (8, 'G', 'G'): 0.692307692, (8, 'G', 'U'): 0.928571429,
    # Position 9
    (9, 'U', 'C'): 0.357142857, (9, 'U', 'G'): 0.357142857, (9, 'U', 'U'): 0.4,
    (9, 'C', 'A'): 0.4, (9, 'C', 'C'): 0.214285714, (9, 'C', 'U'): 0.538461538,
    (9, 'A', 'A'): 0.214285714, (9, 'A', 'C'): 0.538461538, (9, 'A', 'G'): 0.6,
    (9, 'G', 'A'): 0.6, (9, 'G', 'G'): 0.5, (9, 'G', 'U'): 0.619047619,
    # Position 10
    (10, 'U', 'C'): 0.205128205, (10, 'U', 'G'): 0.205128205, (10, 'U', 'U'): 0.428571429,
    (10, 'C', 'A'): 0.428571429, (10, 'C', 'C'): 0.0, (10, 'C', 'U'): 0.307692308,
    (10, 'A', 'A'): 0.0, (10, 'A', 'C'): 0.307692308, (10, 'A', 'G'): 0.5,
    (10, 'G', 'A'): 0.5, (10, 'G', 'G'): 0.4, (10, 'G', 'U'): 0.5,
    # Position 11
    (11, 'U', 'C'): 0.333333333, (11, 'U', 'G'): 0.333333333, (11, 'U', 'U'): 0.384615385,
    (11, 'C', 'A'): 0.384615385, (11, 'C', 'C'): 0.0, (11, 'C', 'U'): 0.428571429,
    (11, 'A', 'A'): 0.0, (11, 'A', 'C'): 0.428571429, (11, 'A', 'G'): 0.384615385,
    (11, 'G', 'A'): 0.384615385, (11, 'G', 'G'): 0.428571429, (11, 'G', 'U'): 0.357142857,
    # Position 12
    (12, 'U', 'C'): 0.263157895, (12, 'U', 'G'): 0.263157895, (12, 'U', 'U'): 0.461538462,
    (12, 'C', 'A'): 0.461538462, (12, 'C', 'C'): 0.0, (12, 'C', 'U'): 0.285714286,
    (12, 'A', 'A'): 0.0, (12, 'A', 'C'): 0.285714286, (12, 'A', 'G'): 0.444444444,
    (12, 'G', 'A'): 0.444444444, (12, 'G', 'G'): 0.285714286, (12, 'G', 'U'): 0.6,
    # Position 13
    (13, 'U', 'C'): 0.230769231, (13, 'U', 'G'): 0.230769231, (13, 'U', 'U'): 0.5,
    (13, 'C', 'A'): 0.5, (13, 'C', 'C'): 0.0, (13, 'C', 'U'): 0.0,
    (13, 'A', 'A'): 0.0, (13, 'A', 'C'): 0.0, (13, 'A', 'G'): 0.230769231,
    (13, 'G', 'A'): 0.230769231, (13, 'G', 'G'): 0.529411765, (13, 'G', 'U'): 0.466666667,
    # Position 14
    (14, 'U', 'C'): 0.285714286, (14, 'U', 'G'): 0.285714286, (14, 'U', 'U'): 0.181818182,
    (14, 'C', 'A'): 0.181818182, (14, 'C', 'C'): 0.0, (14, 'C', 'U'): 0.0,
    (14, 'A', 'A'): 0.0, (14, 'A', 'C'): 0.0, (14, 'A', 'G'): 0.0,
    (14, 'G', 'A'): 0.0, (14, 'G', 'G'): 0.214285714, (14, 'G', 'U'): 0.5,
    # Position 15
    (15, 'U', 'C'): 0.066666667, (15, 'U', 'G'): 0.066666667, (15, 'U', 'U'): 0.214285714,
    (15, 'C', 'A'): 0.214285714, (15, 'C', 'C'): 0.0, (15, 'C', 'U'): 0.066666667,
    (15, 'A', 'A'): 0.0, (15, 'A', 'C'): 0.066666667, (15, 'A', 'G'): 0.066666667,
    (15, 'G', 'A'): 0.066666667, (15, 'G', 'G'): 0.272727273, (15, 'G', 'U'): 0.272727273,
    # Position 16
    (16, 'U', 'C'): 0.0, (16, 'U', 'G'): 0.0, (16, 'U', 'U'): 0.0,
    (16, 'C', 'A'): 0.0, (16, 'C', 'C'): 0.0, (16, 'C', 'U'): 0.0,
    (16, 'A', 'A'): 0.0, (16, 'A', 'C'): 0.0, (16, 'A', 'G'): 0.0,
    (16, 'G', 'A'): 0.0, (16, 'G', 'G'): 0.0, (16, 'G', 'U'): 0.0,
    # Position 17
    (17, 'U', 'C'): 0.176470588, (17, 'U', 'G'): 0.176470588, (17, 'U', 'U'): 0.214285714,
    (17, 'C', 'A'): 0.214285714, (17, 'C', 'C'): 0.0, (17, 'C', 'U'): 0.13,
    (17, 'A', 'A'): 0.0, (17, 'A', 'C'): 0.13, (17, 'A', 'G'): 0.07,
    (17, 'G', 'A'): 0.07, (17, 'G', 'G'): 0.0, (17, 'G', 'U'): 0.066666667,
    # Position 18
    (18, 'U', 'C'): 0.19047619, (18, 'U', 'G'): 0.19047619, (18, 'U', 'U'): 0.0,
    (18, 'C', 'A'): 0.0, (18, 'C', 'C'): 0.0, (18, 'C', 'U'): 0.0,
    (18, 'A', 'A'): 0.0, (18, 'A', 'C'): 0.0, (18, 'A', 'G'): 0.0,
    (18, 'G', 'A'): 0.0, (18, 'G', 'G'): 0.0, (18, 'G', 'U'): 0.0,
    # Position 19
    (19, 'U', 'C'): 0.206896552, (19, 'U', 'G'): 0.206896552, (19, 'U', 'U'): 0.137931034,
    (19, 'C', 'A'): 0.137931034, (19, 'C', 'C'): 0.0, (19, 'C', 'U'): 0.0,
    (19, 'A', 'A'): 0.0, (19, 'A', 'C'): 0.0, (19, 'A', 'G'): 0.137931034,
    (19, 'G', 'A'): 0.137931034, (19, 'G', 'G'): 0.0, (19, 'G', 'U'): 0.0,
    # Position 20
    (20, 'U', 'C'): 0.0, (20, 'U', 'G'): 0.0, (20, 'U', 'U'): 0.0,
    (20, 'C', 'A'): 0.0, (20, 'C', 'C'): 0.0, (20, 'C', 'U'): 0.0,
    (20, 'A', 'A'): 0.0, (20, 'A', 'C'): 0.0, (20, 'A', 'G'): 0.0,
    (20, 'G', 'A'): 0.0, (20, 'G', 'G'): 0.0, (20, 'G', 'U'): 0.0,
}

# PAM penalty for off-target NAG/etc when on-target was NGG
_PAM_SCORES: dict[str, float] = {
    "GG": 1.000, "GA": 0.069, "GC": 0.022, "GU": 0.016,
    "AG": 0.259, "AA": 0.000, "AC": 0.000, "AU": 0.000,
    "CG": 0.107, "CA": 0.000, "CC": 0.000, "CU": 0.000,
    "UG": 0.038, "UA": 0.000, "UC": 0.000, "UU": 0.000,
}


def cfd_score(sgrna_20: str, target_20: str, off_target_pam: str = "GG") -> float:
    """Compute the CFD score for a single off-target site.
    Returns activity score in [0, 1]; 1 = full activity, 0 = no cutting.
    """
    sg = sgrna_20.upper().replace("T", "U")
    tg = target_20.upper().replace("T", "U")
    if len(sg) != 20 or len(tg) != 20:
        raise ValueError(f"Both sequences must be 20 nt; got {len(sg)}, {len(tg)}")

    pam = off_target_pam.upper().replace("T", "U")[-2:]   # last 2 nt of PAM
    pam_score = _PAM_SCORES.get(pam, 0.0)

    score = pam_score
    for i in range(20):
        if sg[i] == tg[i]:
            continue
        # The sgRNA's "guide" base pairs with target's complement; CFD tables
        # use the (sgRNA, target_strand) base identities as listed.
        score *= _MM_SCORES.get((i + 1, sg[i], tg[i]), 0.0)
    return score


def aggregate_specificity(off_target_cfds: list[float]) -> float:
    """Convert a list of CFD scores at off-target sites into the CRISPOR
    specificity score, scaled to [0, 100]. 100 = perfectly specific."""
    s = sum(off_target_cfds)
    return 100.0 * 100.0 / (100.0 + s)
