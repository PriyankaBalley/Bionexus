"""Phylogeny endpoints - live EBI Clustal Omega + Simple Phylogeny."""
from fastapi import APIRouter, HTTPException
from app.schemas.models import PhylogenyRequest, JobResponse, JobStatus
from app.workers.protein_tasks import task_phylogeny
from app.services.phylogeny_remote import EXAMPLE_SEQUENCES

router = APIRouter(prefix="/phylogeny", tags=["phylogeny"])


@router.post("", response_model=JobResponse)
def submit_phylogeny(req: PhylogenyRequest):
    if not req.input_text.strip():
        raise HTTPException(status_code=400, detail="input_text is required")
    if req.input_text.count(">") < 3 and req.input_text.count("\n") < 2:
        raise HTTPException(status_code=400, detail="Provide at least 3 sequences")
    async_res = task_phylogeny.delay(req.input_text.strip())
    return JobResponse(job_id=async_res.id, status=JobStatus.PENDING,
                       message="Phylogeny job submitted - this queries live EBI "
                               "services and can take several minutes")


@router.get("/example")
def get_example():
    return {"input_text": EXAMPLE_SEQUENCES}
