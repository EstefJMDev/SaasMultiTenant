# Arquitectura General

## Estructura de alto nivel

- API FastAPI unica con routers por plataforma y dominios:
  - `backend-fastapi/app/platform/router.py`
  - `backend-fastapi/app/domains/router.py`
- SPA React con enrutado hash:
  - `frontend-react/src/router.tsx`
- Redis compartido para Celery y rate limit:
  - `backend-fastapi/app/workers/celery_app.py`
  - `backend-fastapi/app/core/rate_limit.py`

## Patron backend por dominios

- `app/platform/`: capacidades transversales (auth, tenants, iam, tools, health, notifications, audit)
- `app/domains/`: negocio (procurement, invoices, tickets, projects, work, time, org, analytics, signatures)
- `app/services/`: servicios de plataforma historicos y auxiliares

## Patron frontend entities/widgets/pages

- `frontend-react/src/entities/`: cliente de dominio (queries, mutaciones, tipos, keys)
- `frontend-react/src/widgets/`: componentes funcionales complejos
- `frontend-react/src/pages/`: paginas de ruta

## Persistencia y asincronia

- Modelos SQLModel registrados en `backend-fastapi/app/db/base.py`
- Migraciones Alembic en `backend-fastapi/alembic/`
- Jobs asinc en `backend-fastapi/app/workers/tasks/`

## Integraciones relevantes

- OCR y parsing con cliente Ollama: `backend-fastapi/app/ai/client.py`
- Firma electronica: `backend-fastapi/app/domains/signatures/_core/providers/`
