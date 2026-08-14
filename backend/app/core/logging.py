"""Centralized logging using loguru."""
import sys
from loguru import logger
from .config import settings

logger.remove()
logger.add(
    sys.stdout,
    level="DEBUG" if settings.APP_ENV == "development" else "INFO",
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
)
logger.add(
    f"{settings.DATA_DIR}/logs/editease.log",
    rotation="20 MB",
    retention="14 days",
    level="INFO",
    enqueue=True,
)

__all__ = ["logger"]
