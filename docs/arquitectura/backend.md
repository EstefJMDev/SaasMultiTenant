# Backend

## Entrada y ensamblado

- App factory: `backend-fastapi/app/main.py`
- Router API v1: `backend-fastapi/app/api/v1/router.py`
- Registro de routers:
  - plataforma: `backend-fastapi/app/platform/router.py`
  - dominios: `backend-fastapi/app/domains/router.py`

## Dependencias y autorizacion

- Auth usuario actual: `backend-fastapi/app/api/deps.py`
- Resolucion tenant: `get_current_tenant` en `app/api/deps.py`
- Permisos por rol: `require_permissions`, `require_any_permissions`
- Tool gating y tenant scope: `backend-fastapi/app/platform/tools/deps.py`

## Dominio procurement/contracts

La funcionalidad de contratos se implementa en:

- `backend-fastapi/app/domains/procurement/contracts/`

donde:

- `routers/` contiene endpoints (`contracts_router.py`, `comparatives_router.py`, `sync_router.py`)
- `crud.py` contiene operaciones de datos y control de estado
- `read.py` compone payloads de lectura
- `validators.py` valida y normaliza datos de contrato/proveedor
- `_internal/` contiene servicios internos de sincronizacion y contratos

## Dominio invoices

- API: `backend-fastapi/app/domains/invoices/routers/router.py`
- Servicio principal: `backend-fastapi/app/domains/invoices/service.py`
- OCR/parsing: `backend-fastapi/app/domains/invoices/ocr/`
- Worker de extraccion: `backend-fastapi/app/workers/tasks/invoices.py`

## Dominio tickets

- API: `backend-fastapi/app/domains/tickets/api.py`
- Servicio: `backend-fastapi/app/domains/tickets/service.py`
- Repositorio de acceso a datos: `backend-fastapi/app/domains/tickets/repo.py`

## Plataforma

- Auth y MFA: `backend-fastapi/app/platform/auth/router.py`
- IAM usuarios/invitaciones: `backend-fastapi/app/platform/iam/`
- Tenants: `backend-fastapi/app/platform/tenants/`
- Branding por tenant: `backend-fastapi/app/platform/branding/`
