from celery import Celery
from celery.schedules import crontab

from app.core.config import settings
from app.db import base  # noqa: F401  Importa modelos para el worker


celery_app = Celery(
    "saas_app",
    broker=settings.celery_broker_url,
)

# Configuracion global de Celery.
celery_app.conf.update(
    broker_connection_retry_on_startup=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_track_started=True,
    timezone=settings.celery_timezone,
    task_soft_time_limit=settings.celery_soft_time_limit_seconds,
    task_time_limit=settings.celery_time_limit_seconds,
    broker_transport_options={
        "visibility_timeout": settings.celery_visibility_timeout_seconds,
    },
)

# Programacion de tareas recurrentes.
celery_app.conf.beat_schedule = {
    "send_due_reminders_daily": {
        "task": "app.workers.tasks.invoices.send_due_reminders",
        "schedule": crontab(minute=0, hour=7),
    },
    "ai_health_check": {
        "task": "app.workers.tasks.health.ai_health_check",
        "schedule": crontab(minute="*/3"),
    },
    "worker_heartbeat": {
        "task": "app.workers.tasks.health.worker_heartbeat",
        "schedule": crontab(minute="*"),
    },
    "contracts_auto_approve_stale_workflow": {
        "task": "app.workers.tasks.contracts.auto_approve_stale_workflow",
        "schedule": crontab(minute=15, hour="*"),
    },
    "comparatives_auto_approve_stale": {
        "task": "app.workers.tasks.contracts.auto_approve_stale_comparatives",
        "schedule": crontab(minute=30, hour="*"),
    },
}

celery_app.conf.update(
    include=[
        "app.workers.tasks.invoices",
        "app.workers.tasks.health",
        "app.workers.tasks.contracts",
    ]
)

# Register task signal handlers for per-task / per-tenant metrics.
import app.workers.metrics  # noqa: E402,F401
