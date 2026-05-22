# Backend Architecture

## 1) Arquitectura por dominios

### platform/\*

- Responsabilidad: plataforma compartida (tools, entitlements, auth helpers, dependencias transversales).
- Ejemplos: `app/platform/tools/*`, `app/platform/router.py`.

### domains/\*

- Responsabilidad: dominios funcionales con owner unico.
- Estructura tipica: `api.py`, `service.py`, `repo.py`, `schemas.py`, `deps.py`.
- Dominios consolidados: `org`, `projects`, `procurement`, `signatures`, `tickets`, `time`, `work`.
- Enrutado: `app/domains/router.py` agrega routers canonicals.

### wrappers legacy

- Legacy vive en `app/api/v1/routes/*` o modulos legacy (`app/contracts/*`, `app/signatures/*`).
- Los wrappers no contienen logica de negocio. Solo delegan y marcan deprecated.
- Headers obligatorios en legacy:
  - `Deprecation: true`
  - `Sunset: Wed, 31 Dec 2026 23:59:59 GMT`

### core/\*

- Responsabilidad: configuracion, permisos, DB bootstrap/session, seguridad, seeds.
- Ejemplos: `app/core/permissions.py`, `app/core/db_session.py`, `app/core/db_bootstrap.py`.

## 2) Sistema de permisos

### Matriz oficial por dominio

- Org
  - `org:departments:read`
  - `org:departments:write`
  - `org:people:read`
  - `org:people:write`
  - `org:allocations:read`
  - `org:allocations:write`
  - `org:reports:read`

- Signatures
  - `signatures:read`
  - `signatures:write`
  - `signatures:config`
  - `signatures:admin`

- Time
  - `time:read`
  - `time:track`
  - `time:reports:read`

- Work
  - `work:read`
  - `work:write`

- Procurement
  - `procurement:read`
  - `procurement:create`
  - `procurement:edit`
  - `procurement:approve`
  - `procurement:reject`

- Projects
  - `projects:read`
  - `projects:write`

- Contracts (legacy principal)
  - `contracts:read`
  - `contracts:create`
  - `contracts:edit`
  - `contracts:approve`
  - `contracts:reject`

- Tickets
  - `tickets:create`
  - `tickets:read_own`
  - `tickets:read_tenant`
  - `tickets:manage`

- Users
  - `users:read`
  - `users:create`
  - `users:update`
  - `users:delete`

- Tenants
  - `tenants:read`
  - `tenants:create`
  - `tenants:update`
  - `tenants:delete`

- Tools
  - `tools:read`
  - `tools:launch`
  - `tools:configure`

### PERMISSION_ALIASES

- Definido en `app/core/permissions.py`.
- Objetivo: compatibilidad temporal con permisos legacy.
- Ejemplos:
  - `signatures:*` acepta alias `contracts:*`.
  - `org:*` acepta alias `hr:*`.
  - `time:*` y `work:*` aceptan alias `erp:*`.
  - `projects:*` acepta alias `erp:*`.
  - `procurement:*` acepta alias `contracts:*`.
- Los checks se centralizan en `has_permission` y se reutilizan por:
  - `require_perm` (1 permiso)
  - `require_permissions` (AND)
  - `require_any_permissions` (OR)

### Deny-by-default

- Si no hay tool habilitada o permiso valido, el acceso es 403.
- No se permiten fallbacks implicitos fuera de `PERMISSION_ALIASES`.

## 3) Legacy strategy

### Rutas deprecated

- Rutas legacy se mantienen como wrappers sin logica, delegando al dominio owner.
- Ejemplos actuales:
  - `/api/v1/hr/*` ? alias de `org`.
  - `/api/v1/erp/projects/*` ? alias de `projects`.
  - `/api/v1/tickets-legacy` ? alias de `tickets`.
  - Rutas legacy de signatures en `app/signatures/router.py` y `app/api/v1/routes/signatures.py`.

### Sunset

- Fecha oficial: `Wed, 31 Dec 2026 23:59:59 GMT`.

### Pol�tica de eliminaci�n futura

- 1. Medir uso con logs de legacy wrappers.
- 2. Avisos a integradores.
- 3. Eliminar alias despues de Sunset cuando no haya trafico relevante.

## 4) DB architecture

- `app/core/db_session.py`
  - Define `engine` y `get_session()` para FastAPI.

- `app/core/db_bootstrap.py`
  - `init_db()` con compatibilidad legacy.
  - Helpers privados para mantener orden sin cambiar SQL.

- `app/db/session.py`
  - Wrapper legacy que reexporta `engine`, `get_session`, `init_db`.
