# Widgets Frontend

## App shell y layout

- `frontend-react/src/widgets/app-shell/AppShell.tsx`
- `frontend-react/src/widgets/app-shell/AppSidebar.tsx`
- `frontend-react/src/components/layout/AppTopbar/ConnectedTopbar.tsx`

## Widget de contratos

- Componente raiz: `frontend-react/src/widgets/contracts/ContractsModule.tsx`
- Secciones internas:
  - `sections/comparative-review/`
  - `sections/contract-form/`
  - `sections/approval/`
  - `sections/documents/`

El modulo integra:

- creacion/edicion de contrato
- carga de ofertas
- comparativa OCR/manual
- workflow de aprobaciones
- lanzamiento de firma

## Widget de facturas

- `frontend-react/src/widgets/invoices/InvoicesUploadCard.tsx`
- `frontend-react/src/widgets/invoices/InvoicesTableCard.tsx`
- `frontend-react/src/widgets/invoices/InvoiceDetailsPanel.tsx`
- `frontend-react/src/widgets/invoices/InvoicesSummaryPanel.tsx`

## Widget de tickets

- `frontend-react/src/widgets/support-tickets/SupportTicketsPanel.tsx`
- subcomponentes en `frontend-react/src/widgets/support-tickets/components/`

Implementa listado, filtros, detalle, asignacion y conversacion de tickets.
