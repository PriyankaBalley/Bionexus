"""Protein properties endpoints — ExPASy ProtParam (live)."""
from fastapi import APIRouter, HTTPException
from app.schemas.models import ProtParamRequest, JobResponse, JobStatus
from app.workers.protein_tasks import task_protparam
from app.services.protparam import EXAMPLE_PROTEIN

router = APIRouter(prefix="/protparam", tags=["protein-properties"])


@router.post("", response_model=JobResponse)
def submit_protparam(req: ProtParamRequest):
    if not req.input_text.strip():
        raise HTTPException(status_code=400, detail="input_text is required")
    async_res = task_protparam.delay(req.input_text.strip())
    return JobResponse(job_id=async_res.id, status=JobStatus.PENDING,
                       message="Protein properties job submitted")


@router.get("/example")
def get_example():
    return {"input_text": EXAMPLE_PROTEIN}
