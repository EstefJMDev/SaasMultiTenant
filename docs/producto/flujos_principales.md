# Flujos Principales

## Contratos

### Subida de ofertas

- Endpoint: `POST /api/v1/contracts/{contract_id}/offers`
- Implementacion backend en `backend-fastapi/app/domains/procurement/contracts/routers/comparatives_router.py`
- Persistencia y normalizacion en `backend-fastapi/app/domains/procurement/contracts/crud.py`
- OCR/enriquecimiento de oferta en `backend-fastapi/app/domains/invoices/ocr/service.py` (`extract_and_apply_offer_data`)

### Comparativa

- Consulta y reconstruccion en endpoints de `comparatives_router.py`
- Servicios: `backend-fastapi/app/domains/procurement/comparatives/service.py`
- UI principal: `frontend-react/src/widgets/contracts/sections/comparative-review/ComparativeReviewTableSection.tsx`

### Seleccion de proveedor

- Endpoint: `POST /api/v1/contracts/{contract_id}/select-offer`
- Servicio: `contracts_service.select_offer` desde `backend-fastapi/app/domains/procurement/contracts/service.py`
- Sincronizacion de snapshot proveedor en `ensure_supplier_snapshot` (`crud.py`)

### Generacion de contrato

- Endpoint: `POST /api/v1/contracts/{contract_id}/generate-docs`
- Generadores: `backend-fastapi/app/domains/documents/service.py` y `backend-fastapi/app/domains/procurement/documents/`
- Registro documental en `ContractDocument` (`backend-fastapi/app/platform/contracts_core/models.py`)

### Workflow de aprobacion

- Configuracion tenant: `GET/PUT /api/v1/contracts/workflow`
- Estado por contrato: `GET /api/v1/contracts/{id}/workflow-approvals`
- Logica: `backend-fastapi/app/domains/procurement/workflow/approvals.py`
- UI: `frontend-react/src/widgets/contracts/sections/approval/ApprovalOverviewSection.tsx`

### Firma

- Creacion de solicitud: `POST /api/v1/contracts/{id}/signature-requests`
- Flujos provider en `backend-fastapi/app/domains/signatures/_core/`
- Endpoints publicos de firma: `backend-fastapi/app/domains/signatures/api.py` (`public_router`)

## Facturas

### Subida

- Endpoint: `POST /api/v1/invoices` (`backend-fastapi/app/domains/invoices/routers/router.py`)
- UI subida: `frontend-react/src/widgets/invoices/InvoicesUploadCard.tsx`

### OCR

- Task asincrona: `app.workers.tasks.invoices.extract_invoice`
- Llamada desde upload/reprocess: `extract_invoice.delay(...)`
- OCR/parsing: `backend-fastapi/app/domains/invoices/ocr/service.py`

### Validacion y estado

- Update/mark-paid: `PATCH /api/v1/invoices/{id}`, `POST /api/v1/invoices/{id}/mark-paid`
- Servicio: `backend-fastapi/app/domains/invoices/service.py`
- UI tabla/detalle: `frontend-react/src/widgets/invoices/InvoicesTableCard.tsx`, `InvoiceDetailsPanel.tsx`

### Almacenamiento

- Facturas en FS: ruta de config `invoices_storage_path` (`backend-fastapi/app/core/config.py`)
- En Docker: volumen `./data/invoices:/data/invoices` (`infra/docker-compose.yml`)

## Tickets

### Creacion

- Endpoint: `POST /api/v1/tickets` (`backend-fastapi/app/domains/tickets/api.py`)
- Servicio: `create_ticket` en `backend-fastapi/app/domains/tickets/service.py`

### Asignacion

- Endpoint: `POST /api/v1/tickets/{id}/assign`
- Validaciones de tenant y permisos en `service.py` (`_get_ticket_for_manage`)

### Conversacion

- Endpoints: `GET/POST /api/v1/tickets/{id}/messages`
- Soporte de notas internas con `is_internal`
- UI: `frontend-react/src/widgets/support-tickets/SupportTicketsPanel.tsx`
