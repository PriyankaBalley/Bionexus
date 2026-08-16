"""Transmembrane + signal peptide endpoints - live EBI Phobius."""
from fastapi import APIRouter, HTTPException
from app.schemas.models import TransmembraneRequest, JobResponse, JobStatus
from app.workers.protein_tasks import task_transmembrane
from app.services.phobius_remote import EXAMPLE_SEQUENCE

router = APIRouter(prefix="/transmembrane", tags=["transmembrane"])


@router.post("", response_model=JobResponse)
def submit_transmembrane(req: TransmembraneRequest):
    if not req.input_text.strip():
        raise HTTPException(status_code=400, detail="input_text is required")
    async_res = task_transmembrane.delay(req.input_text.strip())
    return JobResponse(job_id=async_res.id, status=JobStatus.PENDING,
                       message="Transmembrane prediction job submitted - this "
                               "queries live EBI Phobius and can take a while")


@router.get("/example")
def get_example():
    return {"input_text": EXAMPLE_SEQUENCE}
