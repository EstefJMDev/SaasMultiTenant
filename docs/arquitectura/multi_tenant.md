# Multi-Tenant

## Resolucion de tenant en backend

### Regla central

- Funcion: `tenant_required_for_superadmin` en `backend-fastapi/app/core/tenancy.py`

Comportamiento:

- Superadmin: `X-Tenant-Id` es obligatorio y debe ser entero valido.
- Usuario no superadmin: usa `current_user.tenant_id`.
- Si un no superadmin envia `X-Tenant-Id` distinto a su tenant, responde `403`.

### Otras resoluciones

- `resolve_tenant_scope` en `backend-fastapi/app/platform/tools/deps.py`
- `tenant_for_write` en contratos/invoices/proyectos/work/time llama a la regla central

## Aislamiento de datos entre tenants

- Modelos con `tenant_id` en `backend-fastapi/app/platform/contracts_core/models.py`, `app/domains/invoices/models.py`, `app/models/ticket.py`, `app/models/erp.py`, `app/models/hr.py`.
- Consultas siempre filtran por `tenant_id` en repositorios/CRUD.
  - Ejemplo contratos: `_get_contract_or_404` y `list_contracts` en `backend-fastapi/app/domains/procurement/contracts/crud.py`
  - Ejemplo tickets: `list_tickets` y `_ensure_visibility_for_user` en `backend-fastapi/app/domains/tickets/service.py`

## Guards de tenant

- API deps generales: `backend-fastapi/app/api/deps.py`
- Tool+perm scopes: `backend-fastapi/app/platform/tools/deps.py`
- Guard especifico contratos: `ensure_tenant_access` en `backend-fastapi/app/platform/contracts_core/permissions.py`
- Guard branding: `_ensure_tenant_access` en `backend-fastapi/app/platform/branding/router.py`

## Superadmin

- Puede operar globalmente solo en endpoints que permiten scope opcional.
- En dominios con `require_header=True` (projects/work/time y contratos), debe seleccionar tenant.
- En frontend, superadmin selecciona tenant en topbar:
  - storage: `frontend-react/src/shared/api/tenant.ts`
  - hook efectivo: `frontend-react/src/hooks/useEffectiveTenantId.ts`
  - bloqueo de rutas tenant-scoped sin tenant: `frontend-react/src/widgets/app-shell/AppShell.tsx`

## Prevencion de acceso cross-tenant

- Validacion de cabecera `X-Tenant-Id` contra usuario en `tenant_required_for_superadmin`.
- Filtrado de entidad por `tenant_id` en cada lectura/actualizacion.
- Permisos sobre tenant resuelto en `require_perm` y `require_tool`.
- En frontend, cache segmentada por tenant con keys (`frontend-react/src/shared/routing/tenantKeys.ts`, `tenantScope.ts`).
