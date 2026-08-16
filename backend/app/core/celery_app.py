"""Celery application factory."""
from celery import Celery
from .config import settings

celery_app = Celery(
    "editease",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.retrieval_tasks",
        "app.workers.promoter_tasks",
        "app.workers.sgrna_tasks",
        "app.workers.protein_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=60 * 30,        # 30 min hard limit
    task_soft_time_limit=60 * 25,
    worker_prefetch_multiplier=1,
    result_expires=60 * 60 * 24 * 3,  # 3 days
)
