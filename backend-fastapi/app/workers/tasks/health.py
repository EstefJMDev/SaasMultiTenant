import socket
from datetime import datetime, timezone
from pathlib import Path

import redis

from app.ai.client import OllamaClient
from app.core.config import settings
from app.core.worker_health import (
    CELERY_WORKER_HEARTBEAT_KEY,
    CELERY_WORKER_STORAGE_PROBE_FILENAME,
)
from app.workers.celery_app import celery_app


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


@celery_app.task(name="app.workers.tasks.health.ai_health_check")
def ai_health_check() -> None:
    client = OllamaClient()
    redis_client = _redis_client()

    is_ok = client.health_check(timeout=settings.ai_health_check_timeout_seconds)
    if is_ok:
        redis_client.delete("ai:down")
    else:
        redis_client.set("ai:down", "1", ex=settings.ai_circuit_breaker_ttl_seconds)


@celery_app.task(name="app.workers.tasks.health.worker_heartbeat")
def worker_heartbeat() -> None:
    redis_client = _redis_client()
    now = datetime.now(timezone.utc).isoformat()
    payload = f"{now}|{socket.gethostname()}"
    ttl = max(30, settings.celery_worker_health_ttl_seconds * 2)
    redis_client.set(CELERY_WORKER_HEARTBEAT_KEY, payload, ex=ttl)

    if not settings.celery_worker_storage_probe_enabled:
        return

    for base_path in (settings.invoices_storage_path, settings.contracts_storage_path):
        base = Path(base_path)
        base.mkdir(parents=True, exist_ok=True)
        probe = base / CELERY_WORKER_STORAGE_PROBE_FILENAME
        probe.write_text(payload, encoding="utf-8")
