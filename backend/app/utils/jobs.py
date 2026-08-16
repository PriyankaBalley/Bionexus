"""Helpers to translate Celery state to API JobStatus."""
from celery.result import AsyncResult
from app.core.celery_app import celery_app
from app.schemas.models import JobStatus, JobStatusResponse


def get_job_status(job_id: str) -> JobStatusResponse:
    res = AsyncResult(job_id, app=celery_app)
    state = res.state
    progress = 0
    result = None
    error = None

    if state == "PENDING":
        status = JobStatus.PENDING
    elif state == "STARTED":
        status = JobStatus.STARTED
        if isinstance(res.info, dict):
            progress = int(res.info.get("progress", 0))
            if "stage" in res.info:
                result = {"stage": res.info["stage"]}
    elif state == "SUCCESS":
        status = JobStatus.SUCCESS
        progress = 100
        result = res.result if isinstance(res.result, dict) else {"value": res.result}
    elif state == "FAILURE":
        status = JobStatus.FAILURE
        error = str(res.info) if res.info else "Task failed"
    elif state == "REVOKED":
        status = JobStatus.REVOKED
    else:
        status = JobStatus.PENDING

    return JobStatusResponse(
        job_id=job_id, status=status, progress=progress,
        result=result, error=error,
    )
