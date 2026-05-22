# Variables de Entorno

## Fuente de verdad

`backend-fastapi/app/core/config.py` define las variables soportadas por el backend.

## Variables criticas

- Base:
  - `ENV`
  - `DEBUG`
  - `DATABASE_URL`
  - `SECRET_KEY`
- Auth y cookies:
  - `ACCESS_TOKEN_EXPIRE_MINUTES`
  - `AUTH_COOKIE_NAME`
  - `AUTH_COOKIE_SECURE`
  - `AUTH_COOKIE_SAMESITE`
  - `CSRF_ENABLED`
- Multi-tenant:
  - `PRIMARY_DOMAIN`
  - `ALLOWED_ORIGINS`
  - `FRONTEND_BASE_URL`
- Redis/Celery/rate limit:
  - `REDIS_URL`
  - `CELERY_BROKER_URL`
  - `RATE_LIMIT_USE_REDIS`
  - `RATE_LIMIT_SKIP_IN_LOCAL`
- OCR/IA:
  - `OLLAMA_BASE_URL`
  - `OLLAMA_OCR_MODEL`
  - `OLLAMA_JSON_MODEL`
  - timeouts `OLLAMA_*_TIMEOUT_SECONDS`
- Almacenamiento:
  - `INVOICES_STORAGE_PATH`
  - `CONTRACTS_STORAGE_PATH`
  - `AVATARS_STORAGE_PATH`
  - `LOGOS_STORAGE_PATH`
  - `PROJECT_DOCS_STORAGE_PATH`

## Reglas de seguridad ya codificadas

En `Settings.validate_non_local_rules`:

- `SECRET_KEY` obligatorio y robusto en no local
- `ALLOW_BOOTSTRAP_SUPERADMIN` debe ser `False` fuera de local
- `AUTH_COOKIE_SECURE` debe ser `True` fuera de local
