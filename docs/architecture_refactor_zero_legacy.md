# Cierre del Refactor Estructural Cero Legacy (backend-fastapi/app)

## 1) Resumen ejecutivo

El backend tenia duplicidades historicas y capas legacy coexistiendo con dominios modernos (p. ej. `app/contracts`, `app/invoices`, `app/signatures` en paralelo a `app/domains/*`). Eso generaba ambiguedad de ownership, import paths inconsistentes y mayor coste de mantenimiento.

Este refactor consolida la arquitectura hacia una unica fuente de verdad por dominio:

- **Dominio de negocio** ? `app/domains/*`
- **Plataforma transversal** ? `app/platform/*`

Impacto:

- **Sin cambios de endpoints ni rutas p�blicas**.
- **Cambios internos de imports** y reorganizacion de modulos.
- Eliminacion de duplicados legacy y shims.

## 2) Historial por commits (cronol�gico)

1. **chore(refactor): inventory report**
   - Inventario de routers e imports; base para decisiones de canonicalizacion.
2. **refactor(signatures): move core into domains/signatures/\_core**
   - Core de signatures movido a `_core` dentro del dominio.
3. **refactor(contracts): move templates under domains and remove legacy path**
   - Templates de contratos consolidados bajo `app/domains/procurement/contracts/templates`.
4. **refactor(invoices): consolidate under domains and remove legacy module**
   - Unificacion de invoices en `app/domains/invoices`.
5. **refactor(notifications): consolidate under platform and remove domain duplicate**
   - Notificaciones consolidadas en `app/platform/notifications`.
6. **refactor(contracts): mover core a platform/contracts_core**
   - Core de contracts movido a `app/platform/contracts_core` y eliminacion de `app/contracts`.

## 3) Arquitectura resultante (principios)

- **`app/domains/*`** contiene logica de negocio y routers por dominio.
- **`app/platform/*`** contiene servicios transversales (auth, tenants, notifications, etc.).
- **No hay duplicados en la raiz** (`app/contracts`, `app/invoices`, `app/signatures` eliminados).
- **Imports explicitos**, sin shims o reexports legacy.
- **Routers solo en domains/platform**, agregados por `app/api`.

## 4) Estructura de carpetas (nivel 1) y proposito

> Todas las carpetas listadas son de **primer nivel** bajo `backend-fastapi/app/`.

- **`ai/`**
  - Proposito: cliente y utilidades de IA (parsing, prompts, proveedores).
  - Contiene: adaptadores/clients, parsers, prompts.
  - No debe mezclar: logica de dominio ni modelos DB.
  - Dependencias permitidas: `core`, `platform` (si aplica), **no** `domains` (salvo orquestaci�n expl�cita).

- **`api/`**
  - Proposito: agregador de routers (composicion de `platform` + `domains`).
  - Contiene: `api/v1/router.py`.
  - No debe mezclar: logica de negocio.
  - Dependencias permitidas: `domains`, `platform`.

- **`core/`**
  - Proposito: utilidades transversales (tenancy, config, bootstrap DB).
  - Contiene: helpers de tenant, config, bootstrap.
  - No debe mezclar: logica de dominio ni routers.
  - Dependencias permitidas: modelos base, utils compartidos.

- **`db/`**
  - Proposito: configuracion y acceso a DB (session, base metadata).
  - Contiene: session, base.
  - No debe mezclar: logica de negocio.
  - Dependencias permitidas: `models`, `schemas`.

- **`domains/`**
  - Proposito: logica de negocio por dominio (servicios, routers, repos).
  - Contiene: dominios activos (ver listado mas abajo).
  - No debe mezclar: servicios transversales de plataforma.
  - Dependencias permitidas: `core`, `models`, `schemas`, `platform` (cuando sea transversal).

- **`models/`**
  - Proposito: modelos globales/compartidos (SQLModel).
  - Contiene: entidades cross-domain.
  - No debe mezclar: logica de negocio.
  - Dependencias permitidas: `core`.

- **`platform/`**
  - Proposito: servicios transversales (auth, tenants, notifications, IAM, etc.).
  - Contiene: modulos de plataforma y routers propios.
  - No debe mezclar: logica especifica de un dominio.
  - Dependencias permitidas: `models`, `schemas`, `core`.

- **`schemas/`**
  - Proposito: esquemas compartidos/transversales.
  - Contiene: Pydantic/DTOs cross-domain.
  - No debe mezclar: logica ni acceso DB.

- **`services/`**
  - Proposito: servicios legacy o transversales aun vigentes (no dominio).
  - Contiene: servicios genericos no ubicados en dominios.
  - No debe crecer; todo nuevo desarrollo debe ir a `domains` o `platform`.

- **`storage/`**
  - Proposito: almacenamiento y persistencia de archivos.
  - Contiene: drivers y utilidades de storage.
  - No debe mezclar: logica de negocio.

- **`workers/`**
  - Proposito: tareas asincronas (Celery / background jobs).
  - Contiene: tasks por dominio o transversales.
  - Dependencias permitidas: `domains`, `platform`.

### Dominios activos (`app/domains/*`)

- **analytics**: metricas, dashboards y endpoints de analisis.
- **documents**: generacion/lectura de documentos y utilidades PDF.
- **invoices**: facturas y OCR asociado.
- **org**: estructura organizativa (departamentos, people, allocations).
- **procurement**: contratos, comparatives, workflow, documentos de contratos.
- **projects**: proyectos y presupuestos.
- **signatures**: API de firmas y flujo de configuracion/integracion.
- **tickets**: tickets de soporte/operaciones.
- **time**: tracking de tiempo.
- **work**: colaboraciones externas y recursos laborales.

### Plataforma (`app/platform/*`)

- **auth**: autenticacion y sesiones.
- **iam**: usuarios y permisos.
- **tenants**: gestion de tenants.
- **notifications**: notificaciones transversales.
- **contracts_core**: core compartido de contratos (modelos/esquemas/permissions/workflow).
- **audit, tools, branding, health**: utilidades de plataforma.

## 5) Eliminaciones realizadas

- `app/invoices`
- `app/signatures`
- `app/domains/notifications`
- `app/contracts`
- Directorios muertos/vacios detectados tras consolidacion

## 6) Validacion tecnica

- **Ruff**: OK
- **Pytest**: OK (95 tests)
- **Legacy refs**: 0 resultados para
  - `app.contracts`
  - `app.invoices`
  - `app.signatures`
  - `app.domains.notifications`

## 7) Riesgos residuales / notas

- Cambios unicamente internos de imports; no se modificaron rutas API.
- En Windows, ejecuciones largas de `pytest` pueden mostrar warnings/timeouts de stdout, pero los tests completan correctamente.
- Recomendacion: mantener guardrails de arquitectura y reglas de import explicitas.

## 8) Arbol final simplificado (nivel 2 y 3)

```
app/
  ai/
  api/
  core/
  db/
  domains/
    analytics/
    documents/
    invoices/
    org/
    procurement/
    projects/
    signatures/
    tickets/
    time/
    work/
  models/
  platform/
    audit/
    auth/
    branding/
    contracts_core/
    health/
    iam/
    notifications/
    rbac_seed/
    tenants/
    tools/
  schemas/
  services/
  storage/
  workers/
```
