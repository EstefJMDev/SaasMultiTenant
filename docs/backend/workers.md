# Workers

## Configuracion Celery

- App: `backend-fastapi/app/workers/celery_app.py`
- Broker: `settings.celery_broker_url` (Redis)
- Queue por defecto: `default`
- `task_acks_late=True`, `worker_prefetch_multiplier=1`

## Tareas registradas

- Facturas: `backend-fastapi/app/workers/tasks/invoices.py`
  - `extract_invoice`
  - `send_due_reminders`
  - `send_invoice_created_notification`
- Contratos: `backend-fastapi/app/workers/tasks/contracts.py`
  - `generate_contract_docs`
  - `send_contract_notification`
  - `ocr_extract_offer` (placeholder)
  - `auto_approve_stale_workflow`
- Salud IA: `backend-fastapi/app/workers/tasks/health.py`
  - `ai_health_check`

## Beat schedule

Definido en `celery_app.conf.beat_schedule`:

- Recordatorios facturas: diario 07:00
- `ai_health_check`: cada 3 minutos
- Autoaprobacion workflow contratos: minuto 15 cada hora

## Contenedores

En `infra/docker-compose.yml`:

- `celery-worker`: ejecuta workers
- `celery-beat`: ejecuta programador
