"""Module: Protein physicochemical properties — ExPASy ProtParam (live).

Queries the real ExPASy ProtParam CGI endpoint
(web.expasy.org/cgi-bin/protparam/protparam) and parses its HTML result
page. This is a live external query, like the PlantPAN integration
elsewhere in this app - see plantpan_remote.py for the same pattern.

Gasteiger E, Hoogland C, Gattiker A, Duvaud S, Wilkins MR, Appel RD,
Bairoch A. "Protein Identification and Analysis Tools on the ExPASy
Server." In: John M. Walker (ed): The Proteomics Protocols Handbook,
Humana Press (2005). pp. 571-607.
"""
from __future__ import annotations
import csv
import json
import re
from pathlib import Path

import requests

from app.core.logging import logger

PROTPARAM_URL = "https://web.expasy.org/cgi-bin/protparam/protparam"

EXAMPLE_PROTEIN = (
    ">example_kinase_domain\n"
    "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVK"
    "ALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWE"
)


def _strip_tags(html: str) -> str:
    text = re.sub(r"<[^>]+>", "", html)
    return re.sub(r"\n\s*\n+", "\n", text)


def _num(pattern: str, text: str, cast=float):
    m = re.search(pattern, text)
    return cast(m.group(1)) if m else None


def _parse_extinction(text: str) -> list[dict]:
    """ProtParam reports one extinction coefficient when the sequence has
    no Cys, or two (cystines / reduced) when it does - each immediately
    followed by its own Abs 0.1% line, optionally with an "assuming..."
    qualifier naming which Cys state it corresponds to.
    """
    block_m = re.search(r"Extinction coefficients:(.*?)(?:Estimated half-life|$)", text, re.S)
    if not block_m:
        return []
    block = block_m.group(1)
    entries = []
    for m in re.finditer(
        r"Ext\. coefficient\s+(\d+)\s*\n"
        r"Abs 0\.1% \(=1 g/l\)\s+([\d.]+)"
        r"(?:,\s*(assuming[^\n]*))?",
        block,
    ):
        ext, abs01, note = m.groups()
        entries.append({
            "extinction_coefficient": int(ext),
            "abs_0_1_percent": float(abs01),
            "assumption": note.strip() if note else None,
        })
    return entries


def _parse_protparam(text: str) -> dict:
    if "ERROR" in text or "Number of amino acids" not in text:
        m = re.search(r"Sorry\.[^\n]*", text)
        raise ValueError(m.group(0) if m else "ExPASy ProtParam returned an error")

    aa_composition = {}
    for m in re.finditer(
        r"([A-Za-z]{3}) \(([A-Zx]|[A-Za-z])\)\s+(\d+)\s+([\d.]+)%", text
    ):
        code3, code1, count, pct = m.groups()
        aa_composition[code1] = {"name": code3, "count": int(count), "percent": float(pct)}

    formula_m = re.search(r"Formula:\s*(\S+)", text)
    atomic = {}
    for elem in ("Carbon", "Hydrogen", "Nitrogen", "Oxygen", "Sulfur"):
        m = re.search(rf"{elem}\s+\S\s+(\d+)", text)
        if m:
            atomic[elem] = int(m.group(1))

    half_life = {}
    for org_m in re.finditer(
        r"([><]?\d+(?:\.\d+)?)\s*hours?\s*\(([^)]+)\)", text
    ):
        value, org = org_m.groups()
        half_life[org.strip()] = value.strip()

    warning_m = re.search(r"Warning:[^\n]*", text)

    # The 14 property groups ExPASy ProtParam actually reports, in the
    # order its own results page presents them:
    return {
        # 1. sequence length
        "num_amino_acids": _num(r"Number of amino acids:\s*(\d+)", text, int),
        # 2. molecular weight
        "molecular_weight": _num(r"Molecular weight:\s*([\d.]+)", text),
        # 3. theoretical isoelectric point
        "theoretical_pi": _num(r"Theoretical pI:\s*([\d.]+)", text),
        # 4. full amino acid composition table
        "amino_acid_composition": aa_composition,
        # 5. negatively charged residue count
        "negatively_charged_residues": _num(
            r"negatively charged residues \(Asp \+ Glu\):\s*(\d+)", text, int),
        # 6. positively charged residue count
        "positively_charged_residues": _num(
            r"positively charged residues \(Arg \+ Lys\):\s*(\d+)", text, int),
        # 7. atomic composition (C, H, N, O, S counts)
        "atomic_composition": atomic,
        # 8. molecular formula
        "formula": formula_m.group(1) if formula_m else None,
        # 9. total atom count
        "total_atoms": _num(r"Total number of atoms:\s*(\d+)", text, int),
        # 10. extinction coefficient(s) - 1 entry if no Cys, 2 if the
        #     sequence contains Cys (cystines-formed / all-reduced)
        "extinction_coefficients": _parse_extinction(text),
        # 11. estimated half-life per organism/system
        "estimated_half_life": half_life,
        # 12. instability index + stable/unstable classification
        "instability_index": _num(r"computed to be\s*([\d.]+)", text),
        "instability_classification": (
            "stable" if "classifies the protein as stable" in text
            else "unstable" if "classifies the protein as unstable" in text
            else None
        ),
        # 13. aliphatic index
        "aliphatic_index": _num(r"Aliphatic index:\s*([\d.]+)", text),
        # 14. grand average of hydropathicity
        "gravy": _num(r"\(GRAVY\):\s*(-?[\d.]+)", text),
        "warning": warning_m.group(0) if warning_m else None,
    }


def fetch_protparam(sequence: str, timeout: int = 30) -> dict:
    """Query the live ExPASy ProtParam service for one protein sequence."""
    resp = requests.post(PROTPARAM_URL, data={"sequence": sequence}, timeout=timeout)
    resp.raise_for_status()
    return _parse_protparam(_strip_tags(resp.text))


def run_protparam(sequences: list[tuple[str, str]], job_dir: Path) -> dict:
    """Run live ExPASy ProtParam over one or more sequences."""
    results: dict[str, dict] = {}
    summary_rows = []
    errors: list[str] = []

    for seq_id, seq in sequences:
        try:
            props = fetch_protparam(seq)
        except Exception as e:
            msg = f"ProtParam live lookup failed for '{seq_id}': {e}"
            logger.warning(msg)
            errors.append(msg)
            continue
        results[seq_id] = props
        ext = props["extinction_coefficients"]
        summary_rows.append({
            "sequence_id": seq_id,
            "length": props["num_amino_acids"],
            "molecular_weight": props["molecular_weight"],
            "theoretical_pi": props["theoretical_pi"],
            "negatively_charged_residues": props["negatively_charged_residues"],
            "positively_charged_residues": props["positively_charged_residues"],
            "formula": props["formula"],
            "total_atoms": props["total_atoms"],
            "ext_coefficient_1": ext[0]["extinction_coefficient"] if len(ext) > 0 else None,
            "ext_coefficient_2": ext[1]["extinction_coefficient"] if len(ext) > 1 else None,
            "instability_index": props["instability_index"],
            "instability_classification": props["instability_classification"],
            "aliphatic_index": props["aliphatic_index"],
            "gravy": props["gravy"],
        })
        logger.info(f"{seq_id}: ProtParam OK ({props['num_amino_acids']} aa)")

    (job_dir / "protparam_results.json").write_text(json.dumps(results, indent=2))

    summary_csv = job_dir / "protparam_summary.csv"
    with summary_csv.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "sequence_id", "length", "molecular_weight", "theoretical_pi",
            "negatively_charged_residues", "positively_charged_residues",
            "formula", "total_atoms", "ext_coefficient_1", "ext_coefficient_2",
            "instability_index", "instability_classification", "aliphatic_index", "gravy",
        ])
        w.writeheader()
        w.writerows(summary_rows)

    aa_csv = job_dir / "protparam_amino_acid_composition.csv"
    with aa_csv.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sequence_id", "residue_code", "residue_name", "count", "percent"])
        for seq_id, props in results.items():
            for code, entry in props["amino_acid_composition"].items():
                w.writerow([seq_id, code, entry["name"], entry["count"], entry["percent"]])

    return {
        "source": "ExPASy ProtParam (live)",
        "sequences": summary_rows,
        "results": results,
        "files": {
            "json": str(job_dir / "protparam_results.json"),
            "summary_csv": str(summary_csv),
            "amino_acid_composition_csv": str(aa_csv),
        },
        "errors": errors,
    }
