"""Common endpoints: job status, file listing, downloads."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from app.core.config import settings
from app.schemas.models import JobStatusResponse
from app.utils.jobs import get_job_status

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobStatusResponse)
def status(job_id: str):
    return get_job_status(job_id)


@router.get("/{job_id}/files")
def list_files(job_id: str):
    job_dir = Path(settings.DATA_DIR) / "jobs" / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found")
    files = []
    for p in sorted(job_dir.rglob("*")):
        if p.is_file():
            rel = p.relative_to(job_dir)
            files.append({
                "name": rel.as_posix(),
                "size": p.stat().st_size,
                "url": f"/api/jobs/{job_id}/download/{rel.as_posix()}",
            })
    return {"job_id": job_id, "files": files}


@router.get("/{job_id}/download/{path:path}")
def download(job_id: str, path: str):
    base = Path(settings.DATA_DIR) / "jobs" / job_id
    target = (base / path).resolve()
    # Prevent path traversal
    if not str(target).startswith(str(base.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    media = "application/octet-stream"
    suffix = target.suffix.lower()
    if suffix in (".json",):  media = "application/json"
    elif suffix == ".csv":    media = "text/csv"
    elif suffix == ".html":   media = "text/html"
    elif suffix == ".png":    media = "image/png"
    elif suffix == ".svg":    media = "image/svg+xml"
    elif suffix == ".pdf":    media = "application/pdf"
    elif suffix in (".fasta", ".fa", ".txt"): media = "text/plain"
    return FileResponse(str(target), media_type=media, filename=target.name)
