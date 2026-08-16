"""Celery tasks for protein properties (ExPASy ProtParam) and secondary
structure (GOR I) prediction.
"""
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.logging import logger
from app.utils.seqinput import (
    parse_sequences, validate_protein_sequences, validate_nucleotide_sequences,
)
from app.services.protparam import run_protparam
from app.services.secondary_structure import run_secondary_structure
from app.services.orf_finder import run_orf_prediction
from app.services.phylogeny import run_phylogeny
from app.services.transmembrane import run_transmembrane_prediction
from app.services.subcell_localization import run_localization


@celery_app.task(bind=True, name="protein.protparam")
def task_protparam(self, input_text: str) -> dict:
    job_id = self.request.id
    job_dir = settings.job_dir(job_id)
    self.update_state(state="STARTED", meta={"progress": 5})

    (job_dir / "input.txt").write_text(input_text)
    sequences = parse_sequences(input_text)
    warnings = validate_protein_sequences(sequences)

    try:
        self.update_state(state="STARTED", meta={"progress": 20})
        result = run_protparam(sequences, job_dir)
        result["input_warnings"] = warnings
        return {"progress": 100, **result}
    except Exception as e:
        logger.exception(f"ProtParam task failed: {e}")
        raise


@celery_app.task(bind=True, name="protein.secondary_structure")
def task_secondary_structure(self, input_text: str) -> dict:
    job_id = self.request.id
    job_dir = settings.job_dir(job_id)
    self.update_state(state="STARTED", meta={"progress": 5})

    (job_dir / "input.txt").write_text(input_text)
    sequences = parse_sequences(input_text)
    warnings = validate_protein_sequences(sequences)

    try:
        self.update_state(state="STARTED", meta={"progress": 30})
        result = run_secondary_structure(sequences, job_dir)
        result["input_warnings"] = warnings
        return {"progress": 100, **result}
    except Exception as e:
        logger.exception(f"Secondary structure task failed: {e}")
        raise


@celery_app.task(bind=True, name="protein.orf_prediction")
def task_orf_prediction(self, input_text: str, min_aa: int, require_atg: bool) -> dict:
    job_id = self.request.id
    job_dir = settings.job_dir(job_id)
    self.update_state(state="STARTED", meta={"progress": 5})

    (job_dir / "input.txt").write_text(input_text)
    sequences = parse_sequences(input_text)
    warnings = validate_nucleotide_sequences(sequences)

    try:
        self.update_state(state="STARTED", meta={"progress": 30})
        result = run_orf_prediction(sequences, job_dir, min_aa=min_aa, require_atg=require_atg)
        result["input_warnings"] = warnings
        return {"progress": 100, **result}
    except Exception as e:
        logger.exception(f"ORF prediction task failed: {e}")
        raise


@celery_app.task(bind=True, name="protein.phylogeny")
def task_phylogeny(self, input_text: str) -> dict:
    job_id = self.request.id
    job_dir = settings.job_dir(job_id)
    self.update_state(state="STARTED", meta={"progress": 5})

    (job_dir / "input.txt").write_text(input_text)
    sequences = parse_sequences(input_text)
    fasta_text = "\n".join(f">{sid}\n{seq}" for sid, seq in sequences)

    def on_progress(stage: str):
        pct = {"aligning": 20, "QUEUED": 25, "RUNNING": 40,
               "building tree": 65}.get(stage, 50)
        self.update_state(state="STARTED", meta={"progress": pct, "stage": stage})

    try:
        result = run_phylogeny(fasta_text, job_dir, on_progress=on_progress)
        return {"progress": 100, **result}
    except Exception as e:
        logger.exception(f"Phylogeny task failed: {e}")
        raise


@celery_app.task(bind=True, name="protein.transmembrane")
def task_transmembrane(self, input_text: str) -> dict:
    job_id = self.request.id
    job_dir = settings.job_dir(job_id)
    self.update_state(state="STARTED", meta={"progress": 5})

    (job_dir / "input.txt").write_text(input_text)
    sequences = parse_sequences(input_text)
    warnings = validate_protein_sequences(sequences)

    def on_progress(stage: str):
        self.update_state(state="STARTED", meta={"progress": 40, "stage": stage})

    try:
        result = run_transmembrane_prediction(sequences, job_dir, on_progress=on_progress)
        result["input_warnings"] = warnings
        return {"progress": 100, **result}
    except Exception as e:
        logger.exception(f"Transmembrane prediction task failed: {e}")
        raise


@celery_app.task(bind=True, name="protein.localization")
def task_localization(self, input_text: str) -> dict:
    job_id = self.request.id
    job_dir = settings.job_dir(job_id)
    self.update_state(state="STARTED", meta={"progress": 5})

    (job_dir / "input.txt").write_text(input_text)
    sequences = parse_sequences(input_text)
    warnings = validate_protein_sequences(sequences)

    def on_progress(stage: str):
        self.update_state(state="STARTED", meta={"progress": 40, "stage": stage})

    try:
        result = run_localization(sequences, job_dir, on_progress=on_progress)
        result["input_warnings"] = warnings
        return {"progress": 100, **result}
    except Exception as e:
        logger.exception(f"Localization task failed: {e}")
        raise
