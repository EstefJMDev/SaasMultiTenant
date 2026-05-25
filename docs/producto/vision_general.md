# Vision General

## Objetivo del producto

El sistema implementa una plataforma SaaS multi-tenant para operaciones empresariales con foco en:

- gestion de proyectos y trabajo (`projects`, `work`, `time`)
- procurement y contratos (`procurement/contracts`)
- facturas con OCR y ciclo de vida (`invoices`)
- soporte interno multi-tenant (`tickets`)
- firma electronica (`signatures`)

## Componentes principales

- Backend: `backend-fastapi/app/main.py`
- API versionada: `backend-fastapi/app/api/v1/router.py`
- Frontend SPA: `frontend-react/src/main.tsx`, `frontend-react/src/router.tsx`
- Workers asinc: `backend-fastapi/app/workers/`
- Infra Docker: `infra/docker-compose.yml`

## Alcance multi-tenant

- Todas las entidades de negocio relevantes incluyen `tenant_id` en modelos SQLModel.
- El frontend selecciona tenant efectivo para superadmin mediante `frontend-react/src/shared/api/tenant.ts`.
- El backend valida scoping en dependencias como `backend-fastapi/app/core/tenancy.py` y `backend-fastapi/app/platform/tools/deps.py`.

## Modulos de negocio destacados

- Contratos: `backend-fastapi/app/domains/procurement/contracts/` y `frontend-react/src/widgets/contracts/ContractsModule.tsx`
- Facturas: `backend-fastapi/app/domains/invoices/` y `frontend-react/src/widgets/invoices/`
- Tickets: `backend-fastapi/app/domains/tickets/` y `frontend-react/src/widgets/support-tickets/`
