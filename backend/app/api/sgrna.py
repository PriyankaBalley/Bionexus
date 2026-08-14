"""Module 4 endpoints: sgRNA design."""
from fastapi import APIRouter, HTTPException
from app.schemas.models import SgRNADesignRequest, JobResponse, JobStatus
from app.workers.sgrna_tasks import task_sgrna_design

router = APIRouter(prefix="/sgrna", tags=["sgrna"])


@router.post("/design", response_model=JobResponse)
def submit_sgrna(req: SgRNADesignRequest):
    if not req.fasta_text and not req.job_id_input:
        raise HTTPException(status_code=400,
                            detail="Provide either fasta_text or job_id_input")
    async_res = task_sgrna_design.delay(
        req.fasta_text, req.job_id_input, req.pam,
        req.guide_length, req.max_mismatches, req.genome, req.top_n, req.mode,
    )
    return JobResponse(job_id=async_res.id, status=JobStatus.PENDING,
                       message="sgRNA design job submitted")
