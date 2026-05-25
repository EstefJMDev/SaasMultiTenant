# Docker

## Definicion de servicios

En `infra/docker-compose.yml`:

- `db`: `postgres:16`, puerto host `5433:5432`
- `redis`: `redis:7`, puerto `6379:6379`
- `backend-fastapi`: build desde `../backend-fastapi/Dockerfile`, puerto `8000:8000`
- `frontend-react`: build desde `../frontend-react/Dockerfile`, puerto `5173:5173`
- `celery-worker` y `celery-beat`: mismo build que backend

## Variables de contenedor relevantes

- Backend/worker/beat:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `CELERY_BROKER_URL`
  - `INVOICES_STORAGE_PATH`
  - `CONTRACTS_STORAGE_PATH`
- Frontend:
  - `VITE_API_URL`
  - `VITE_API_PROXY_TARGET`

## Volumenes

- `db_data` para PostgreSQL
- `infra/data/invoices` montado en `/data/invoices`
- `infra/data/contracts` montado en `/data/contracts`
- logos/avatars/project-docs montados en backend

## Comandos utiles

```bash
docker compose ps
docker compose logs -f backend-fastapi
docker compose logs -f celery-worker
docker compose restart backend-fastapi
```
