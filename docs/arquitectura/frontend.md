# Frontend

## Entrada y providers

- Bootstrap: `frontend-react/src/main.tsx`
- Proveedores de app: `frontend-react/src/app/providers.tsx`
- Query client: `frontend-react/src/app/queryClient.ts`
- Theme y branding: `frontend-react/src/shared/theme/`

## Router

- Definicion de rutas: `frontend-react/src/router.tsx`
- Router hash: `createHashHistory()`
- Segmentacion:
  - rutas publicas (`/`, `/mfa`, `/accept-invitation`, `/public/*`)
  - rutas privadas bajo `AppShell`

## AppShell y navegacion

- Contenedor principal: `frontend-react/src/widgets/app-shell/AppShell.tsx`
- Sidebar: `frontend-react/src/widgets/app-shell/AppSidebar.tsx`
- Topbar conectada: `frontend-react/src/components/layout/AppTopbar/ConnectedTopbar.tsx`

## Arquitectura entities/widgets/pages

- Entities de negocio:
  - contratos: `frontend-react/src/entities/contracts/`
  - facturas: `frontend-react/src/entities/invoices/`
  - proyectos: `frontend-react/src/entities/projects/`
  - RRHH: `frontend-react/src/entities/hr/`
- Widgets:
  - contratos: `frontend-react/src/widgets/contracts/`
  - facturas: `frontend-react/src/widgets/invoices/`
  - tickets: `frontend-react/src/widgets/support-tickets/`
- Paginas:
  - ERP: `frontend-react/src/pages/erp/`
  - settings: `frontend-react/src/pages/settings/`
  - auth/public: `frontend-react/src/pages/auth/`, `frontend-react/src/pages/public/`
