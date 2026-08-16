"""BioNexus FastAPI application entrypoint."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.logging import logger
from app.api import (
    retrieve, promoter, sgrna, jobs, health, cloning, gene_family,
    protparam, secstructure, orf, phylogeny, transmembrane, localization,
)

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="1.0.0",
    description="Bioinformatics platform for promoter analysis & CRISPR sgRNA design",
)

app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
def _rate_limit(request: Request, exc: RateLimitExceeded):
    return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)


@app.exception_handler(Exception)
async def global_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.url}: {exc}")
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


@app.on_event("startup")
def _startup():
    logger.info(f"Starting {settings.APP_NAME} ({settings.APP_ENV})")
    settings.data_path.mkdir(parents=True, exist_ok=True)


# Mount routes under /api
app.include_router(health.router,   prefix="/api")
app.include_router(retrieve.router, prefix="/api")
app.include_router(promoter.router, prefix="/api")
app.include_router(sgrna.router,    prefix="/api")
app.include_router(jobs.router,     prefix="/api")
app.include_router(cloning.router,   prefix="/api")
app.include_router(gene_family.router)
app.include_router(protparam.router, prefix="/api")
app.include_router(secstructure.router, prefix="/api")
app.include_router(orf.router, prefix="/api")
app.include_router(phylogeny.router, prefix="/api")
app.include_router(transmembrane.router, prefix="/api")
app.include_router(localization.router, prefix="/api")


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": "/api/health"}
