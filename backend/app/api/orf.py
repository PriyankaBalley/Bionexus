"""ORF prediction endpoints."""
from fastapi import APIRouter, HTTPException
from app.schemas.models import ORFPredictionRequest, JobResponse, JobStatus
from app.workers.protein_tasks import task_orf_prediction
from app.services.orf_finder import EXAMPLE_SEQUENCE

router = APIRouter(prefix="/orf", tags=["orf-prediction"])


@router.post("", response_model=JobResponse)
def submit_orf_prediction(req: ORFPredictionRequest):
    if not req.input_text.strip():
        raise HTTPException(status_code=400, detail="input_text is required")
    async_res = task_orf_prediction.delay(req.input_text.strip(), req.min_aa, req.require_atg)
    return JobResponse(job_id=async_res.id, status=JobStatus.PENDING,
                       message="ORF prediction job submitted")


@router.get("/example")
def get_example():
    return {"input_text": EXAMPLE_SEQUENCE}
