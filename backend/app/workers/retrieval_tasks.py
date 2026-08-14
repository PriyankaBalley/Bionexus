"""Celery tasks for sequence retrieval."""
from pathlib import Path
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.logging import logger
from app.services.retrieval import retrieve_sequence


@celery_app.task(bind=True, name="retrieval.fetch")
def task_retrieve(self, source: str, query: str, species: str | None,
                  upstream: int, downstream: int, region: str) -> dict:
    job_id = self.request.id
    job_dir = settings.job_dir(job_id)
    self.update_state(state="STARTED", meta={"progress": 10})
    try:
        result = retrieve_sequence(source, query, species, upstream, downstream, region, job_dir)
        return {"progress": 100, **result}
    except Exception as e:
        logger.exception(f"Retrieval task failed: {e}")
        raise
