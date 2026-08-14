"""Module 1 endpoints: sequence retrieval."""
from fastapi import APIRouter, HTTPException
from app.schemas.models import RetrievalRequest, JobResponse, JobStatus
from app.workers.retrieval_tasks import task_retrieve

router = APIRouter(prefix="/retrieve", tags=["retrieval"])


@router.post("", response_model=JobResponse)
def submit_retrieval(req: RetrievalRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    async_res = task_retrieve.delay(
        req.source.value, req.query.strip(), req.species,
        req.upstream_bp, req.downstream_bp, req.region,
    )
    return JobResponse(job_id=async_res.id, status=JobStatus.PENDING,
                       message="Retrieval job submitted")
