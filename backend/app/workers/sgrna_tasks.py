"""Celery tasks for sgRNA design."""
from pathlib import Path
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.logging import logger
from app.services.sgrna import design_sgrnas


@celery_app.task(bind=True, name="sgrna.design")
def task_sgrna_design(self, fasta_text: str | None, job_id_input: str | None,
                      pam: str, guide_length: int, max_mismatches: int,
                      genome: str | None, top_n: int,
                      mode: str = "knockout") -> dict:
    job_id = self.request.id
    job_dir = settings.job_dir(job_id)
    self.update_state(state="STARTED", meta={"progress": 5})

    if fasta_text:
        fasta_path = job_dir / "input.fasta"
        fasta_path.write_text(fasta_text)
    elif job_id_input:
        src = settings.job_dir(job_id_input) / "sequence.fasta"
        if not src.exists():
            raise FileNotFoundError(f"No sequence.fasta in job {job_id_input}")
        fasta_path = job_dir / "input.fasta"
        fasta_path.write_bytes(src.read_bytes())
    else:
        raise ValueError("Provide either fasta_text or job_id_input")

    genome_path = None
    if genome:
        gp = Path(settings.DATA_DIR) / "genomes" / f"{genome}.fa"
        if gp.exists():
            genome_path = gp
        else:
            logger.warning(f"Genome file not found: {gp}")

    try:
        self.update_state(state="STARTED", meta={"progress": 30})
        result = design_sgrnas(fasta_path, pam, guide_length, max_mismatches,
                               genome_path, top_n, job_dir, mode=mode)
        return {"progress": 100, **result}
    except Exception as e:
        logger.exception(f"sgRNA task failed: {e}")
        raise
