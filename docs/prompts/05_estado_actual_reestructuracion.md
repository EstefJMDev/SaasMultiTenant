# Estado actual - Reestructuracion comparativos / contratos

Fecha de corte: 25/05/2026

## Estado general
- Fase 1: COMPLETADA y validada en ejecucion real.
- Fase 2: COMPLETADA.
- Fase 2.1 (correccion tenant_id): COMPLETADA.
- Fase 3: IMPLEMENTADA en codigo.
- Fase 4: PENDIENTE.

## Fase 1 validada
- `INIT_DB` operativo.
- 12 tablas nuevas creadas.
- FK a `proveedores.id` creada con BIGINT en `proveedor_id`.
- Guard de bootstrap para exigir tabla `proveedores`.

## Fase 2 completada
- Archivo creado: `backend-fastapi/app/platform/contracts_core/comparativos_schemas.py`.
- Schemas de comparativo, hitos, ofertas (y partidas), aprobaciones e historial.
- `cif` y `razon_social` incluidos como campos derivados en lectura.

## Fase 2.1 completada
- Se detecto falta de `tenant_id` en tablas nuevas.
- Se corrigieron modelos SQLModel para incluir `tenant_id` en todas las tablas nuevas.
- Se implemento rutina idempotente de bootstrap para BD ya creada:
- `ADD COLUMN tenant_id` si falta
- backfill desde tabla padre
- `ALTER COLUMN tenant_id SET NOT NULL`
- FK a `tenant(id)`
- indice por `tenant_id`
- Validado en PostgreSQL real: las 12 tablas nuevas quedaron con `tenant_id` no nulo + FK + indice.

## Fase 3 implementada
- Modulo nuevo: `backend-fastapi/app/domains/procurement/comparativos_v2/`.
- Archivos creados: `repo.py`, `service.py`, `__init__.py`.
- Repo nuevo con CRUD de comparativo, hitos, ofertas, historial y aprobaciones.
- Servicio nuevo con crear, editar, obtener, listar, enviar a aprobacion, aprobar, rechazar, devolver a cambios y stub de generacion de contrato.
- Compilacion sintactica validada con `py_compile`.

## Riesgo abierto actual
- La validacion de import/runtime del backend sigue condicionada por una incompatibilidad existente del entorno `sqlmodel`/`pydantic` al cargar modelos, ajena al modulo `comparativos_v2`.

## Pendiente
- Router nuevo del flujo.
- Tests del flujo.
- Validacion funcional real del servicio nuevo.
- Generacion de contrato desde comparativo aprobado (fase posterior).

## No tocado aun
- Frontend
- Migracion de datos legacy
- Endpoints legacy
