from datetime import datetime, timezone
from pathlib import Path

import redis
from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.worker_health import (
    CELERY_WORKER_HEARTBEAT_KEY,
    CELERY_WORKER_STORAGE_PROBE_FILENAME,
)


router = APIRouter()


@router.get("/", summary="Health check de la API")
def health_check() -> dict:
    """
    Endpoint sencillo para que orquestadores (Docker, k8s, etc.)
    verifiquen que la API está levantada.
    """

    return {"status": "ok"}


def _read_worker_heartbeat() -> tuple[bool, str | None, int | None]:
    try:
        client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        payload = client.get(CELERY_WORKER_HEARTBEAT_KEY)
    except Exception:
        return False, None, None

    if not payload:
        return False, None, None

    timestamp_raw, _, worker_name = payload.partition("|")
    try:
        beat_time = datetime.fromisoformat(timestamp_raw)
        if beat_time.tzinfo is None:
            beat_time = beat_time.replace(tzinfo=timezone.utc)
        age_seconds = int((datetime.now(timezone.utc) - beat_time).total_seconds())
    except Exception:
        return False, worker_name or None, None

    is_fresh = age_seconds <= settings.celery_worker_health_ttl_seconds
    return is_fresh, (worker_name or None), age_seconds


def _storage_probe_ok(path_value: str) -> bool:
    probe = Path(path_value) / CELERY_WORKER_STORAGE_PROBE_FILENAME
    if not probe.exists():
        return False
    age_seconds = int(datetime.now(timezone.utc).timestamp() - probe.stat().st_mtime)
    return age_seconds <= settings.celery_worker_health_ttl_seconds


@router.get("/celery-metrics", summary="Métricas de tareas Celery por task y tenant")
def celery_metrics() -> dict:
    from app.workers.metrics import read_task_metrics
    return read_task_metrics()


@router.get("/worker", summary="Health check de Celery worker")
def worker_health_check() -> dict:
    is_fresh, worker_name, age_seconds = _read_worker_heartbeat()
    invoices_probe_ok = _storage_probe_ok(settings.invoices_storage_path)
    contracts_probe_ok = _storage_probe_ok(settings.contracts_storage_path)

    storage_ok = True
    if settings.celery_worker_storage_probe_enabled:
        storage_ok = invoices_probe_ok and contracts_probe_ok

    healthy = is_fresh and storage_ok
    payload = {
        "status": "ok" if healthy else "error",
        "worker_heartbeat_fresh": is_fresh,
        "worker_name": worker_name,
        "heartbeat_age_seconds": age_seconds,
        "storage_probe_enabled": settings.celery_worker_storage_probe_enabled,
        "invoices_probe_ok": invoices_probe_ok,
        "contracts_probe_ok": contracts_probe_ok,
    }
    if not healthy:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=payload,
        )
    return payload

