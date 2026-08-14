"""Curated cis-regulatory element motifs from PlantCARE and PlantPAN public databases.

These are well-known plant cis-regulatory elements published in the literature.
For a production system, replace with a complete download of the PlantCARE
matrix file (license permitting) or run the official web tool and parse output
via the `plantcare_remote.py` adapter.
"""
from __future__ import annotations

# (name, IUPAC pattern, description, database)
PLANT_CIS_MOTIFS: list[tuple[str, str, str, str]] = [
    # Light-responsive
    ("G-box",          "CACGTG",        "Light responsive element",                    "PlantCARE"),
    ("GT1-motif",      "GGTTAA",        "Light responsive element",                    "PlantCARE"),
    ("Box 4",          "ATTAAT",        "Light responsive element",                    "PlantCARE"),
    ("GATA-motif",     "GATAGGA",       "Light responsive element",                    "PlantCARE"),
    ("I-box",          "GATAAGGTG",     "Light-regulated element",                     "PlantCARE"),
    ("TCT-motif",      "TCTTAC",        "Light responsive element",                    "PlantCARE"),
    ("Sp1",            "GGGCGG",        "Light responsive element",                    "PlantCARE"),
    # Hormone-responsive
    ("ABRE",           "ACGTGG",        "ABA responsive element",                      "PlantCARE"),
    ("CGTCA-motif",    "CGTCA",         "MeJA responsive element",                     "PlantCARE"),
    ("TGACG-motif",    "TGACG",         "MeJA responsive element",                     "PlantCARE"),
    ("TCA-element",    "CCATCTTTTT",    "Salicylic acid responsive",                   "PlantCARE"),
    ("TGA-element",    "AACGAC",        "Auxin responsive element",                    "PlantCARE"),
    ("AuxRR-core",     "GGTCCAT",       "Auxin responsive element",                    "PlantCARE"),
    ("GARE-motif",     "TCTGTTG",       "Gibberellin responsive element",              "PlantCARE"),
    ("P-box",          "CCTTTTG",       "Gibberellin responsive element",              "PlantCARE"),
    ("ERE",            "ATTTCAAA",      "Ethylene responsive element",                 "PlantCARE"),
    # Stress-responsive
    ("LTR",            "CCGAAA",        "Low-temperature responsive",                  "PlantCARE"),
    ("MBS",            "CAACTG",        "MYB binding site, drought-induced",           "PlantCARE"),
    ("DRE",            "RCCGAC",        "Dehydration responsive element",              "PlantCARE"),
    ("TC-rich repeats","ATTTTCTTCA",    "Defense and stress response",                 "PlantCARE"),
    ("WUN-motif",      "AAATTACT",      "Wound responsive",                            "PlantCARE"),
    ("ARE",            "AAACCA",        "Anaerobic induction",                         "PlantCARE"),
    ("HSE",            "AAAAAATTTC",    "Heat-shock responsive",                       "PlantCARE"),
    # Tissue-specific
    ("CAT-box",        "GCCACT",        "Meristem expression",                         "PlantCARE"),
    ("RY-element",     "CATGCATG",      "Seed-specific regulation",                    "PlantCARE"),
    ("GCN4_motif",     "TGAGTCA",       "Endosperm expression",                        "PlantCARE"),
    ("Skn-1_motif",    "GTCAT",         "Endosperm expression",                        "PlantCARE"),
    ("circadian",      "CAANNNNATC",    "Circadian control",                           "PlantCARE"),
    # Core promoter
    ("TATA-box",       "TATAAA",        "Core promoter element",                       "PlantCARE"),
    ("CAAT-box",       "CAAT",          "Common cis-acting element in promoters",      "PlantCARE"),
    # PlantPAN: TFBS profiles (representative)
    ("MYB",            "TAACTG",        "MYB transcription factor binding site",      "PlantPAN"),
    ("MYC",            "CANNTG",        "MYC/bHLH binding site",                       "PlantPAN"),
    ("WRKY (W-box)",   "TTGACY",        "WRKY transcription factor binding site",     "PlantPAN"),
    ("bZIP",           "TGACGTCA",      "bZIP transcription factor binding site",     "PlantPAN"),
    ("AP2/ERF",        "GCCGCC",        "AP2/ERF binding site (GCC-box)",              "PlantPAN"),
    ("NAC",            "CACG",          "NAC transcription factor binding site",      "PlantPAN"),
    ("Dof",            "AAAG",          "Dof transcription factor binding site",      "PlantPAN"),
    ("HSF",            "AGAANNTTCT",    "Heat-shock factor binding site",              "PlantPAN"),
    ("ARF",            "TGTCTC",        "Auxin response factor binding site",         "PlantPAN"),
    ("E2F",            "TYTCCCGCC",     "E2F transcription factor binding site",      "PlantPAN"),
    ("TCP",            "GGNCCCAC",      "TCP transcription factor binding site",      "PlantPAN"),
    ("SBP",            "TNCGTACAA",     "SBP transcription factor binding site",      "PlantPAN"),
]
