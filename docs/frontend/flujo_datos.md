# Flujo de Datos Frontend

## Cadena principal

1. UI en `pages/` y `widgets/`
2. Llamada a hooks/entities o `api/*`
3. `apiClient` (`frontend-react/src/shared/api/client.ts`) inyecta headers y CSRF
4. Backend responde DTO y React Query actualiza cache

## Inyeccion de tenant y seguridad de peticiones

- `apiClient` lee tenant de `localStorage` (`contracts_selected_tenant`)
- Si no existe header explicito, anade `X-Tenant-Id`
- Anade `X-Source: web`
- Para metodos mutantes anade `X-CSRF-Token` desde cookie `csrf_token`

## Gestion de sesion

- `useCurrentUser` (`frontend-react/src/hooks/useCurrentUser.ts`) resuelve usuario activo.
- Interceptor de respuesta en `apiClient` redirige a `/` en `401`.

## Flujo de cambio de tenant

- `ConnectedTopbar` permite seleccionar tenant para superadmin
- Al cambiar tenant:
  - escribe storage (`writeTenantId`)
  - cancela queries
  - limpia cache
  - redirige a `/dashboard`
