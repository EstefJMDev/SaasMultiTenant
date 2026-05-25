# Routing Frontend

## Router principal

- Archivo: `frontend-react/src/router.tsx`
- Libreria: `@tanstack/react-router`
- Historial: `createHashHistory()`

## Layouts

- `RootLayout`: suspense y error boundary
- `PublicLayout`: rutas sin sesion
- `PrivateLayout`: renderiza `AppShell` y valida sesion en `beforeLoad`

## Validacion de sesion

En `privateLayoutRoute.beforeLoad`:

- llama `fetchCurrentUser()`
- redirige a `/` solo si recibe `401` o `403`
- evita logout forzado en errores transitorios no auth

## Rutas relevantes

- Publicas:
  - `/`
  - `/mfa`
  - `/accept-invitation`
  - `/supplier-onboarding`
  - `/public/autofirma-sign`
- Privadas:
  - `/dashboard`
  - `/erp/contracts`
  - `/erp/invoices`
  - `/support`
  - `/tenant-settings`, `/tenant-branding`, `/users`, etc.

## Reglas de tenant scope en cliente

- `frontend-react/src/shared/routing/tenantScope.ts`
  - `isTenantScopedRoute`
  - `isTenantRequiredForRequest`
- `AppShell` bloquea rutas tenant-scoped de superadmin sin tenant seleccionado.
