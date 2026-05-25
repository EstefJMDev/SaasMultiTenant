# Servicios Backend

## Servicios transversales

- `backend-fastapi/app/services/auth_service.py`: login y MFA
- `backend-fastapi/app/services/tenant_service.py`: operaciones de tenant
- `backend-fastapi/app/services/user_service.py`: gestion de usuarios
- `backend-fastapi/app/services/notification_service.py`: notificaciones internas
- `backend-fastapi/app/services/dashboard_service.py`: KPIs/dashboard

## Servicios de dominio

- Contratos:
  - fachada: `backend-fastapi/app/domains/procurement/contracts/service.py`
  - workflow: `backend-fastapi/app/domains/procurement/workflow/approvals.py`
  - documentos: `backend-fastapi/app/domains/procurement/documents/service.py`
- Facturas:
  - `backend-fastapi/app/domains/invoices/service.py`
  - OCR helpers en `backend-fastapi/app/domains/invoices/ocr/service.py`
- Tickets:
  - `backend-fastapi/app/domains/tickets/service.py`
- Firmas:
  - `backend-fastapi/app/domains/signatures/service.py`
  - v2 y proveedores: `backend-fastapi/app/domains/signatures/service_v2.py`, `.../_core/service_v2.py`

## Estilo de capa

- Router: parseo HTTP y dependencias.
- Servicio: reglas de negocio.
- Repo/CRUD: acceso SQLModel/SQLAlchemy.
- Schemas: contratos de entrada y salida (`app/schemas` y `domains/*/schemas.py`).
