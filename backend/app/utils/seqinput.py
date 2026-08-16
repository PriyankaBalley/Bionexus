"""Multi-format sequence input parsing shared by the protein-properties and
secondary-structure modules: accepts raw pasted text that is FASTA,
CSV/TSV, or one-sequence-per-line/comma-separated plain sequence(s).
"""
from __future__ import annotations
import csv
import io
import re

_SEQ_COL_NAMES = {"sequence", "seq", "protein", "protein_sequence", "aa_sequence"}
_ID_COL_NAMES = {"id", "name", "seq_id", "sequence_id", "identifier", "label"}

_VALID_AA = set("ACDEFGHIKLMNPQRSTVWYXBZJUO")


def _clean_seq(s: str) -> str:
    return re.sub(r"\s", "", s).upper()


def _looks_like_protein(s: str) -> bool:
    return bool(s) and all(c in _VALID_AA for c in s)


def parse_sequences(text: str) -> list[tuple[str, str]]:
    """Return a list of (id, sequence) pairs, disambiguating repeated ids
    the same way disambiguate_records does elsewhere in this app
    (name -> name__2 -> name__3, avoiding "#" since it breaks download URLs).
    """
    text = text.strip()
    if not text:
        raise ValueError("No sequence input provided")

    if text.lstrip().startswith(">"):
        pairs = _parse_fasta(text)
    elif "," in text.splitlines()[0] or "\t" in text.splitlines()[0]:
        pairs = _parse_csv(text)
    else:
        pairs = _parse_raw(text)

    if not pairs:
        raise ValueError("No usable sequences found in input")

    seen: dict[str, int] = {}
    out = []
    for seq_id, seq in pairs:
        seen[seq_id] = seen.get(seq_id, 0) + 1
        uid = seq_id if seen[seq_id] == 1 else f"{seq_id}__{seen[seq_id]}"
        out.append((uid, seq))
    return out


def _parse_fasta(text: str) -> list[tuple[str, str]]:
    from Bio import SeqIO
    records = list(SeqIO.parse(io.StringIO(text), "fasta"))
    return [(rec.id, _clean_seq(str(rec.seq))) for rec in records]


def _parse_csv(text: str) -> list[tuple[str, str]]:
    dialect = csv.Sniffer().sniff(text.splitlines()[0], delimiters=",\t")
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    fieldnames = [f.strip().lower() for f in (reader.fieldnames or [])]

    seq_col = next((f for f in fieldnames if f in _SEQ_COL_NAMES), None)
    id_col = next((f for f in fieldnames if f in _ID_COL_NAMES), None)

    if seq_col is None:
        # No recognizable header - fall back to positional columns
        # (first = id, last = sequence) using a fresh un-headered reader.
        rows = list(csv.reader(io.StringIO(text), dialect=dialect))
        pairs = []
        for i, row in enumerate(rows, start=1):
            if not row:
                continue
            if len(row) == 1:
                pairs.append((f"seq_{i}", _clean_seq(row[0])))
            else:
                pairs.append((row[0].strip() or f"seq_{i}", _clean_seq(row[-1])))
        return pairs

    pairs = []
    orig_fieldnames = reader.fieldnames or []
    seq_key = orig_fieldnames[fieldnames.index(seq_col)]
    id_key = orig_fieldnames[fieldnames.index(id_col)] if id_col else None
    for i, row in enumerate(reader, start=1):
        seq = _clean_seq(row.get(seq_key, ""))
        if not seq:
            continue
        seq_id = (row.get(id_key, "").strip() if id_key else "") or f"seq_{i}"
        pairs.append((seq_id, seq))
    return pairs


def _parse_raw(text: str) -> list[tuple[str, str]]:
    # One sequence per line, or comma-separated on a single line.
    chunks = [c for c in re.split(r"[\n,]+", text) if c.strip()]
    return [(f"seq_{i}", _clean_seq(c)) for i, c in enumerate(chunks, start=1)]


def validate_nucleotide_sequences(pairs: list[tuple[str, str]]) -> list[str]:
    """Return warnings for empty sequences or ones containing characters
    outside the standard nucleotide + IUPAC ambiguity alphabet.
    """
    valid = set("ACGTUN RYWSKMBDHV".replace(" ", ""))
    warnings = []
    for seq_id, seq in pairs:
        if not seq:
            warnings.append(f"{seq_id}: empty sequence, skipped")
            continue
        bad = sorted(set(seq) - valid)
        if bad:
            warnings.append(f"{seq_id}: contains non-nucleotide characters {bad}")
    return warnings


def validate_protein_sequences(pairs: list[tuple[str, str]]) -> list[str]:
    """Return a list of warning strings for sequences with non-standard
    residues or that look like nucleotide rather than protein input.
    """
    warnings = []
    for seq_id, seq in pairs:
        if not seq:
            warnings.append(f"{seq_id}: empty sequence, skipped")
            continue
        if not _looks_like_protein(seq):
            bad = sorted(set(seq) - _VALID_AA)
            warnings.append(f"{seq_id}: contains non-amino-acid characters {bad}")
        elif set(seq) <= set("ACGTUN"):
            warnings.append(f"{seq_id}: looks like a nucleotide sequence, not protein")
    return warnings
