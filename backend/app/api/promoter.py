"""Modules 2 & 3 endpoints: promoter analysis & visualization."""
from fastapi import APIRouter, HTTPException
from app.schemas.models import PromoterAnalysisRequest, JobResponse, JobStatus
from app.workers.promoter_tasks import task_promoter_analyze

router = APIRouter(prefix="/promoter", tags=["promoter"])


@router.post("/analyze", response_model=JobResponse)
def submit_promoter(req: PromoterAnalysisRequest):
    if not req.fasta_text and not req.job_id_input:
        raise HTTPException(status_code=400,
                            detail="Provide either fasta_text or job_id_input")
    async_res = task_promoter_analyze.delay(
        req.fasta_text, req.job_id_input,
        [d for d in req.databases], req.min_score, req.plantpan_min_score,
    )
    return JobResponse(job_id=async_res.id, status=JobStatus.PENDING,
                       message="Promoter analysis submitted")
