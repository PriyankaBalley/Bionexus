"""Celery tasks for promoter analysis + visualization."""
from pathlib import Path
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.logging import logger
from app.services.promoter import analyze_promoter
from app.services.visualization import render_all


@celery_app.task(bind=True, name="promoter.analyze")
def task_promoter_analyze(self, fasta_text: str | None, job_id_input: str | None,
                          databases: list, min_score: float,
                          plantpan_min_score: float | None = None) -> dict:
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

    try:
        self.update_state(state="STARTED", meta={"progress": 30})
        result = analyze_promoter(fasta_path, databases, min_score, job_dir,
                                  plantpan_min_score=plantpan_min_score)

        self.update_state(state="STARTED", meta={"progress": 70})
        viz_dir = job_dir / "viz"
        viz_dir.mkdir(exist_ok=True)
        viz = render_all(result["results"], fasta_path, viz_dir)
        result["visualizations"] = viz

        return {"progress": 100, **result}
    except Exception as e:
        logger.exception(f"Promoter task failed: {e}")
        raise
