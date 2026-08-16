"""Secondary structure prediction endpoints — GOR I."""
from fastapi import APIRouter, HTTPException
from app.schemas.models import SecondaryStructureRequest, JobResponse, JobStatus
from app.workers.protein_tasks import task_secondary_structure
from app.services.secondary_structure import EXAMPLE_PROTEIN

router = APIRouter(prefix="/secondary-structure", tags=["secondary-structure"])


@router.post("", response_model=JobResponse)
def submit_secondary_structure(req: SecondaryStructureRequest):
    if not req.input_text.strip():
        raise HTTPException(status_code=400, detail="input_text is required")
    async_res = task_secondary_structure.delay(req.input_text.strip())
    return JobResponse(job_id=async_res.id, status=JobStatus.PENDING,
                       message="Secondary structure job submitted")


@router.get("/example")
def get_example():
    return {"input_text": EXAMPLE_PROTEIN}
