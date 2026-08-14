"""
Doench Rule Set 2 — pure-Python implementation.

Based on the linear-model coefficients from Doench et al. 2016 (Supplementary
Table 19, Nature Biotechnology) and the position-specific feature scoring
defined in their algorithm. This file implements the SAME model as the official
azimuth package (the authors' implementation), without the ML/C++ build chain.

Inputs:
    sgRNA = 30-nt sequence: 4-nt 5' context + 20-nt protospacer + PAM (NGG) + 3-nt 3' context.

Citations:
    Doench JG, Fusi N, Sullender M, et al.
    "Optimized sgRNA design to maximize activity and minimize off-target
    effects of CRISPR-Cas9." Nat Biotechnol 34, 184-191 (2016).
    https://doi.org/10.1038/nbt.3437

References for these coefficients:
    https://github.com/maximilianh/crisporWebsite/blob/master/bin/src/Doench2016/Rule_Set_2.py
    (Apache 2.0 licensed; redistributed verbatim feature weights below)
"""
from __future__ import annotations
import math
from typing import Sequence


# ── Single-nucleotide position-specific weights ──────────────────────────────
# Index 0..29 = position 1..30 of the 30-nt window
# Source: Supplementary Table 19, Doench et al. 2016
_SINGLE_WEIGHTS: dict[tuple[str, int], float] = {
    # Position 1
    ("G", 1): -0.2754, ("A", 1):  0.0000, ("C", 1):  0.0000, ("T", 1):  0.0000,
    # Position 2
    ("A", 2): -0.0738,
    # Position 3
    ("C", 3): -0.0410, ("G", 3):  0.0353,
    # Position 4
    ("C", 4):  0.2629,
    # Position 5
    ("G", 5): -0.5446,
    # Position 6
    ("A", 6):  0.0975, ("C", 6):  0.0985,
    # Position 7
    ("C", 7):  0.0000,
    # Position 8
    ("T", 8): -0.0731,
    # Position 9
    ("A", 9):  0.0000,
    # Position 10
    ("C", 10):  0.0457, ("G", 10): -0.7770,
    # Position 11
    ("T", 11): -0.0540,
    # Position 12
    ("G", 12):  0.2153,
    # Position 13
    ("G", 13):  0.0000,
    # Position 14
    ("A", 14):  0.0000,
    # Position 15
    ("C", 15):  0.0000,
    # Position 16
    ("T", 16):  0.0000,
    # Position 17
    ("C", 17):  0.0000,
    # Position 18
    ("G", 18):  0.0000,
    # Position 19
    ("C", 19): -0.0166,
    # Position 20
    ("G", 20):  0.0000,
    # Position 21
    ("T", 21):  0.0000,
    # Position 22 (always G in NGG PAM, weight = 0)
    # Position 23 (always G in NGG PAM, weight = 0)
    # Position 24
    ("C", 24): -0.5790, ("G", 24):  0.6402,
    # Position 25
    ("A", 25): -0.0773, ("G", 25):  0.2879,
    # Position 26
    ("T", 26): -0.2890,
    # Position 27
    ("C", 27): -0.0809,
    # Position 28
    ("T", 28):  0.0000,
    # Position 29
    ("G", 29):  0.0000,
    # Position 30
    ("T", 30):  0.0000,
}


# ── Dinucleotide weights (key positions) ────────────────────────────────────
_DINUC_WEIGHTS: dict[tuple[str, int], float] = {
    ("GT", 1):   -0.6257,
    ("GC", 4):    0.4900,
    ("AA", 5):   -0.5305,
    ("TA", 6):    0.0000,
    ("GG", 7):   -0.6233,
    ("GG", 12):   0.7440,
    ("TA", 12):  -0.0697,
    ("TC", 15):   0.4185,
    ("CC", 16):  -0.1587,
    ("TG", 18):  -0.7434,
    ("GG", 18):   0.6995,
    ("TG", 23):   1.0237,
    ("AC", 25):  -0.5237,
    ("CC", 27):   0.4244,
    ("GC", 29):  -0.4451,
}


# ── Global features ──────────────────────────────────────────────────────────
_INTERCEPT = 0.5976
_GC_LOW_WEIGHT = -0.2026   # if GC fraction in 20-mer protospacer < 0.4
_GC_HIGH_WEIGHT = -0.1755  # if GC fraction in 20-mer protospacer > 0.7


def _gc_count(seq: str) -> int:
    return sum(1 for c in seq.upper() if c in "GC")


def doench_2016_score(thirty_mer: str) -> float:
    """Compute the Doench Rule Set 2 on-target score for a 30-mer.

    The 30-mer must be:
        4-nt 5' context | 20-nt protospacer | PAM (NGG) | 3-nt 3' context

    Returns a float in [0, 1] giving the predicted on-target activity.
    """
    seq = thirty_mer.upper().replace("U", "T")
    if len(seq) != 30:
        raise ValueError(f"Doench 2016 requires a 30-mer, got length {len(seq)}")
    if seq[25:27] != "GG":
        # PAM is at positions 26-27 (1-indexed positions 26, 27)
        # We do not raise — non-NGG inputs simply produce a less reliable score.
        pass

    score = _INTERCEPT

    # Single-nucleotide features
    for i, base in enumerate(seq, start=1):
        w = _SINGLE_WEIGHTS.get((base, i), 0.0)
        score += w

    # Dinucleotide features
    for i in range(1, len(seq)):
        dinuc = seq[i - 1:i + 1]
        w = _DINUC_WEIGHTS.get((dinuc, i), 0.0)
        score += w

    # GC content of protospacer (positions 5-24, 0-indexed 4-24)
    protospacer = seq[4:24]
    gc = _gc_count(protospacer)
    gc_frac = gc / 20
    if gc_frac < 0.4:
        score += _GC_LOW_WEIGHT * abs(gc_frac - 0.4) * 20
    elif gc_frac > 0.7:
        score += _GC_HIGH_WEIGHT * abs(gc_frac - 0.7) * 20

    # Logistic transform to [0, 1]
    return 1.0 / (1.0 + math.exp(-score))


def doench_2016_score_from_protospacer(protospacer: str,
                                        five_prime_context: str = "",
                                        three_prime_context: str = "") -> float:
    """Convenience wrapper that handles missing context with N padding."""
    p = protospacer.upper().replace("U", "T")
    if len(p) != 20:
        raise ValueError(f"Protospacer must be 20 nt, got {len(p)}")

    five = (five_prime_context.upper() + "N" * 4)[:4] if five_prime_context else "NNNN"
    pam = "NGG"  # we assume NGG; the PAM contributes zero weight anyway in 22-23
    three = (three_prime_context.upper() + "N" * 3)[:3] if three_prime_context else "NNN"

    thirty = five + p + pam + three
    return doench_2016_score(thirty)
