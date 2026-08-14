from fastapi import APIRouter
from app.core.config import settings
import shutil

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "tools": {
            "cas-offinder": bool(shutil.which(settings.CAS_OFFINDER_BIN)),
            "RNAfold":      bool(shutil.which(settings.RNAFOLD_BIN)),
        },
    }
