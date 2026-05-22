# Paginas Frontend

## Paginas de autenticacion y publico

- `frontend-react/src/pages/auth/LoginPage.tsx`
- `frontend-react/src/pages/auth/MFAVerifyPage.tsx`
- `frontend-react/src/pages/auth/AcceptInvitationPage.tsx`
- `frontend-react/src/pages/public/SupplierOnboardingPage.tsx`
- `frontend-react/src/pages/public/PublicAutofirmaSignPage.tsx`

## Paginas ERP

- Contratos: `frontend-react/src/pages/contracts/ContractsPage.tsx`
- Facturas: `frontend-react/src/pages/invoices/InvoicesPage.tsx`
- Proyectos y detalle: `frontend-react/src/pages/erp/ErpProjectsPage.tsx`, `ErpProjectDetailPage.tsx`
- Tiempo: `frontend-react/src/pages/erp/TimeControlPage.tsx`, `TimeReportPage.tsx`

## Paginas de settings

- `frontend-react/src/pages/settings/UsersPage.tsx`
- `frontend-react/src/pages/settings/TenantSettingsPage.tsx`
- `frontend-react/src/pages/settings/TenantBrandingPage.tsx`
- `frontend-react/src/pages/settings/SupportTicketsPage.tsx`
- `frontend-react/src/pages/settings/AuditLogPage.tsx`

## Shims legacy

Existen paginas shim marcadas como deprecated:

- `frontend-react/src/pages/erp/ErpContractsPage.tsx`
- `frontend-react/src/pages/erp/ErpInvoicesPage.tsx`

Estas reexportan paginas canonicas y se mantienen por compatibilidad de imports internos.
