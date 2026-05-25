# Seguridad Backend

## Autenticacion y sesion

- JWT y password hash en `backend-fastapi/app/core/security.py`
- Login y MFA en `backend-fastapi/app/platform/auth/router.py`
- Cookie `access_token` httpOnly + cookie `csrf_token` no-httpOnly

## CSRF

- Middleware CSRF en `backend-fastapi/app/main.py` (`CSRFMiddleware`)
- Se valida para metodos mutantes en `/api/v1/*` cuando la sesion va por cookie
- Header esperado: `X-CSRF-Token`

## Permisos y RBAC

- Dependencias en `backend-fastapi/app/api/deps.py`
- Permisos por rol en tablas `role_permission` y `permission`
- Tool gates por tenant en `backend-fastapi/app/platform/tools/deps.py`

## Seguridad multi-tenant

- Regla de tenant estricto en `backend-fastapi/app/core/tenancy.py`
- Guards por dominio y filtro sistematico por `tenant_id`

## Firma y enlaces publicos

- Verificacion HMAC para enlaces de firma y descarga en `backend-fastapi/app/domains/signatures/api.py`
- Tokens de webhook Signaturit validados por `_validate_webhook_secret`

## Rate limiting en endpoints sensibles

- Implementado en `backend-fastapi/app/core/rate_limit.py`
- Usado en:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/mfa/verify`
  - endpoints de resultado de firma (`client-result`)
