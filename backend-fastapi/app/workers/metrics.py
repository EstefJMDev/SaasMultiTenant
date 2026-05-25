"""
Celery task metrics via Redis.

Tracks success/failure/retry counts and durations per task name.
For tasks operating on invoices or contracts, also tracks per-tenant breakdowns.

Redis key schema:
  celery:metrics:task:{short_name}:success         — INCR counter
  celery:metrics:task:{short_name}:failure         — INCR counter
  celery:metrics:task:{short_name}:retry           — INCR counter
  celery:metrics:task:{short_name}:duration_ms_sum — INCRBY (milliseconds)
  celery:metrics:task:{short_name}:duration_count  — INCR
  celery:metrics:tenant:{tenant_id}:{short_name}:success  — INCR
  celery:metrics:tenant:{tenant_id}:{short_name}:failure  — INCR
  celery:metrics:task:_started_at:{task_id}        — temp start time (EX 3600)
"""

import logging
import time
from typing import Optional

import redis
from celery.signals import task_failure, task_postrun, task_prerun, task_retry
from sqlmodel import Session, select

from app.core.config import settings


logger = logging.getLogger("app.workers.metrics")

# Tasks that carry a tenant-resolvable entity as first positional arg.
_INVOICE_TASKS = {
    "app.workers.tasks.invoices.extract_invoice",
    "app.workers.tasks.invoices.send_invoice_created_notification",
}
_CONTRACT_TASKS = {
    "app.workers.tasks.contracts.generate_contract_docs",
}


def _redis() -> Optional[redis.Redis]:
    try:
        return redis.Redis.from_url(settings.redis_url, decode_responses=True)
    except Exception as exc:
        logger.warning("Celery metrics: Redis no disponible: %s", exc)
        return None


def _short(task_name: str) -> str:
    return task_name.rsplit(".", 1)[-1]


def _started_key(task_id: str) -> str:
    return f"celery:metrics:task:_started_at:{task_id}"


def _resolve_tenant_id(task_name: str, args: tuple) -> Optional[int]:
    """Resolve tenant_id from task args without crashing the signal handler."""
    if not args:
        return None
    entity_id = args[0]
    if not isinstance(entity_id, int):
        return None

    try:
        from app.core.db_session import engine

        if task_name in _INVOICE_TASKS:
            from app.domains.invoices.models import Invoice
            with Session(engine) as session:
                row = session.exec(
                    select(Invoice.tenant_id).where(Invoice.id == entity_id)
                ).one_or_none()
                return int(row) if row else None

        if task_name in _CONTRACT_TASKS:
            from app.platform.contracts_core.models import Contract
            with Session(engine) as session:
                row = session.exec(
                    select(Contract.tenant_id).where(Contract.id == entity_id)
                ).one_or_none()
                return int(row) if row else None

    except Exception as exc:
        logger.debug("Celery metrics: tenant lookup failed for %s: %s", task_name, exc)

    return None


@task_prerun.connect
def on_task_prerun(task_id: str, **kwargs) -> None:
    client = _redis()
    if client is None:
        return
    try:
        client.set(_started_key(task_id), str(time.monotonic()), ex=3600)
    except Exception as exc:
        logger.debug("Celery metrics prerun error: %s", exc)


@task_postrun.connect
def on_task_postrun(
    task_id: str,
    task,
    args: tuple,
    retval,
    state: str,
    **kwargs,
) -> None:
    client = _redis()
    if client is None:
        return

    task_name: str = task.name
    short = _short(task_name)
    outcome = "success" if state == "SUCCESS" else "failure"

    try:
        pipe = client.pipeline(transaction=False)
        pipe.incr(f"celery:metrics:task:{short}:{outcome}")

        # Duration tracking (only on success to exclude retried runs).
        if outcome == "success":
            started_raw = client.get(_started_key(task_id))
            if started_raw:
                elapsed_ms = int((time.monotonic() - float(started_raw)) * 1000)
                pipe.incrby(f"celery:metrics:task:{short}:duration_ms_sum", elapsed_ms)
                pipe.incr(f"celery:metrics:task:{short}:duration_count")
                pipe.delete(_started_key(task_id))

        pipe.execute()

        # Per-tenant counter (separate pipeline to not block on DB lookup).
        tenant_id = _resolve_tenant_id(task_name, args or ())
        if tenant_id is not None:
            client.incr(f"celery:metrics:tenant:{tenant_id}:{short}:{outcome}")

    except Exception as exc:
        logger.debug("Celery metrics postrun error: %s", exc)


@task_failure.connect
def on_task_failure(task_id: str, sender, args: tuple, **kwargs) -> None:
    client = _redis()
    if client is None:
        return

    task_name: str = sender.name
    short = _short(task_name)

    try:
        client.incr(f"celery:metrics:task:{short}:failure")
        tenant_id = _resolve_tenant_id(task_name, args or ())
        if tenant_id is not None:
            client.incr(f"celery:metrics:tenant:{tenant_id}:{short}:failure")
    except Exception as exc:
        logger.debug("Celery metrics failure error: %s", exc)


@task_retry.connect
def on_task_retry(sender, **kwargs) -> None:
    client = _redis()
    if client is None:
        return
    short = _short(sender.name)
    try:
        client.incr(f"celery:metrics:task:{short}:retry")
    except Exception as exc:
        logger.debug("Celery metrics retry error: %s", exc)


def read_task_metrics() -> dict:
    """Read all task metrics from Redis. Used by health endpoints."""
    client = _redis()
    if client is None:
        return {"error": "Redis no disponible"}

    try:
        keys = client.keys("celery:metrics:task:*")
        task_data: dict[str, dict] = {}

        for key in keys:
            if "_started_at:" in key:
                continue
            parts = key.split(":")
            # celery:metrics:task:{short}:{metric}
            if len(parts) < 5:
                continue
            short_name = parts[3]
            metric = parts[4]
            value = int(client.get(key) or 0)

            if short_name not in task_data:
                task_data[short_name] = {}
            task_data[short_name][metric] = value

        # Compute avg duration.
        for short_name, data in task_data.items():
            total_ms = data.pop("duration_ms_sum", 0)
            count = data.pop("duration_count", 0)
            data["avg_duration_ms"] = round(total_ms / count) if count else None

        # Per-tenant breakdown.
        tenant_keys = client.keys("celery:metrics:tenant:*")
        tenant_data: dict[str, dict[str, dict]] = {}
        for key in tenant_keys:
            parts = key.split(":")
            # celery:metrics:tenant:{tenant_id}:{short}:{metric}
            if len(parts) < 6:
                continue
            tenant_id = parts[3]
            short_name = parts[4]
            metric = parts[5]
            value = int(client.get(key) or 0)
            tenant_data.setdefault(tenant_id, {}).setdefault(short_name, {})[metric] = value

        return {"tasks": task_data, "by_tenant": tenant_data}

    except Exception as exc:
        logger.warning("Celery metrics read error: %s", exc)
        return {"error": str(exc)}
