# Modelos Backend

## Registro central

- `backend-fastapi/app/db/base.py` importa todos los modelos para poblar `SQLModel.metadata`.

## Modelos de plataforma

- Tenant: `backend-fastapi/app/models/tenant.py`
- Usuario y RBAC:
  - `app/models/user.py`
  - `app/models/role.py`
  - `app/models/permission.py`
  - `app/models/role_permission.py`
- Herramientas por tenant:
  - `app/models/tool.py`
  - `app/models/tenant_tool.py`
  - `app/models/department_tool.py`

## Modelos de negocio

- ERP/proyectos/trabajo/tiempo: `backend-fastapi/app/models/erp.py`
- RRHH: `backend-fastapi/app/models/hr.py`
- Tickets: `backend-fastapi/app/models/ticket.py`, `ticket_message.py`, `ticket_participant.py`
- Facturas: `backend-fastapi/app/domains/invoices/models.py`
- Contratos core: `backend-fastapi/app/platform/contracts_core/models.py`
- Firma avanzada:
  - `backend-fastapi/app/domains/signatures/_core/models.py`

## Claves de aislamiento

- `tenant_id` indexado en modelos multi-tenant (contratos, facturas, tickets, RRHH, ERP).
- Indices compuestos por tenant para consultas frecuentes:
  - ejemplo contratos en `platform/contracts_core/models.py` (`ix_contract_tenant_status`, `ix_contract_tenant_created`).
