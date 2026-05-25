# Health Checks

## API health

- Endpoint: `GET /api/v1/health/`
- Implementacion:
  - `backend-fastapi/app/platform/health/api.py`
  - `backend-fastapi/app/platform/health/router.py`
- Respuesta: `{"status":"ok"}`

## Startup checks

En `backend-fastapi/app/main.py` (`on_startup`):

- `init_db()`
- `check_rate_limit_backend_connectivity(startup=True)` para validar Redis de rate limit sin tumbar la API

## Health de IA en workers

- Tarea programada `ai_health_check` en `backend-fastapi/app/workers/tasks/health.py`
- Marca estado en Redis key `ai:down` para circuit breaker de OCR/firma
