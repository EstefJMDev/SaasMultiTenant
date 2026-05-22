# Contribucion

## Alcance

- Mantener cambios acotados al dominio afectado.
- Evitar romper alias legacy activos sin plan de migracion.

## Flujo recomendado

1. Crear rama de trabajo.
2. Implementar cambios y tests.
3. Verificar API/Frontend localmente.
4. Revisar impacto multi-tenant y permisos.
5. Abrir PR con contexto tecnico y evidencia.

## Checklist tecnico minimo

- Backend:
  - filtros por `tenant_id` aplicados
  - validaciones de permisos en deps/servicio
  - migraciones si cambia schema
- Frontend:
  - query keys tenant-aware
  - manejo de `X-Tenant-Id` en llamadas nuevas
  - fallback UI para superadmin sin tenant

## Criterios de documentacion

- Cualquier cambio estructural en dominios/rutas/infra debe reflejarse en `docs/`.
