# Rate Limiting

## Implementacion

- Archivo: `backend-fastapi/app/core/rate_limit.py`
- Estrategia:
  - backend Redis preferente (`Redis.from_url`)
  - fallback en memoria local si Redis falla

## Endpoints protegidos actualmente

- Auth:
  - `POST /api/v1/auth/login` (`limit=20`, `window=60s`)
  - `POST /api/v1/auth/mfa/verify` (`limit=30`, `window=300s`)
- Firma:
  - `POST /api/v1/signatures/{id}/client-result` (`limit=5`, `window=60s`)
  - `POST /public/signatures/{id}/client-result` (`limit=5`, `window=60s`)

## Comportamiento de fallback

- Si Redis esta caido:
  - no rompe login ni flujo de firma
  - aplica buckets en memoria por `(key, client_host)`
- Protecciones:
  - limpieza periodica de buckets
  - limite maximo de buckets para evitar crecimiento no acotado

## Excepcion para local

- Si `ENV=local` y `RATE_LIMIT_SKIP_IN_LOCAL=true`, no se aplica limitacion.
