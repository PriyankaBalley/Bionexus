"""Application configuration via environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "BioNexus"
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me-in-production"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Storage
    DATA_DIR: str = "/data"
    JOB_TTL_HOURS: int = 72

    # Redis / Celery
    REDIS_URL: str = "rediss://default:********@profound-mastodon-66490.upstash.io:6379"
    CELERY_BROKER_URL: str = "rediss://default:********@profound-mastodon-66490.upstash.io:6379"
    CELERY_RESULT_BACKEND: str = "rediss://default:********@profound-mastodon-66490.upstash.io:6379"

    # NCBI
    NCBI_EMAIL: str = "user@example.com"
    NCBI_API_KEY: str = ""

    # Ensembl Plants
    ENSEMBL_PLANTS_URL: str = "https://rest.ensembl.org"

    # Sol Genomics
    SGN_URL: str = "https://solgenomics.net"

    # Gramene (gene/annotation lookup; base sequence pulled from Ensembl Plants,
    # since Gramene's core plant genomes share the same underlying databases)
    GRAMENE_URL: str = "https://data.gramene.org/v69"

    # Tool paths (set inside Docker image)
    CAS_OFFINDER_BIN: str = "cas-offinder"
    RNAFOLD_BIN: str = "RNAfold"
    BOWTIE_BIN: str = "bowtie"

    # Limits
    MAX_SEQUENCE_LENGTH: int = 200_000
    MAX_UPSTREAM_BP: int = 10_000
    MAX_DOWNSTREAM_BP: int = 10_000

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def data_path(self) -> Path:
        p = Path(self.DATA_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def job_dir(self, job_id: str) -> Path:
        d = self.data_path / "jobs" / job_id
        d.mkdir(parents=True, exist_ok=True)
        return d


settings = Settings()
