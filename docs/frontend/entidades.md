# Entidades Frontend

## Patron

Cada entidad agrupa:

- tipos de dominio
- consultas/mutaciones con React Query
- claves de cache por tenant

## Entidades implementadas

- Contratos: `frontend-react/src/entities/contracts/`
  - `queries.ts`
  - `mutations.ts`
  - `keys.ts`
- Facturas: `frontend-react/src/entities/invoices/`
- Proyectos: `frontend-react/src/entities/projects/`
- RRHH: `frontend-react/src/entities/hr/`
- Simulaciones: `frontend-react/src/entities/simulations/`

## Relacion con capa API

- La capa `entities/*` usa funciones de `frontend-react/src/api/*.ts`.
- Ejemplo contratos: `src/api/contracts.ts` centraliza endpoints y cabecera `X-Tenant-Id`.

## Aislamiento de cache por tenant

- Keys tenant-aware en `frontend-react/src/shared/routing/tenantKeys.ts`
- Deteccion de queries tenant-scoped en `frontend-react/src/shared/routing/tenantScope.ts`
