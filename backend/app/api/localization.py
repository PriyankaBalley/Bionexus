"""Subcellular localization endpoints - classical heuristic + live Phobius."""
from fastapi import APIRouter, HTTPException
from app.schemas.models import LocalizationRequest, JobResponse, JobStatus
from app.workers.protein_tasks import task_localization
from app.services.subcell_localization import EXAMPLE_SEQUENCE

router = APIRouter(prefix="/localization", tags=["localization"])


@router.post("", response_model=JobResponse)
def submit_localization(req: LocalizationRequest):
    if not req.input_text.strip():
        raise HTTPException(status_code=400, detail="input_text is required")
    async_res = task_localization.delay(req.input_text.strip())
    return JobResponse(job_id=async_res.id, status=JobStatus.PENDING,
                       message="Localization job submitted - this queries live "
                               "EBI Phobius and can take a while")


@router.get("/example")
def get_example():
    return {"input_text": EXAMPLE_SEQUENCE}
