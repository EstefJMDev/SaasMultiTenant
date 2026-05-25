# Reestructuracion BD - Comparativos y Contratos

## Objetivo
Separar el flujo nuevo de comparativos del legacy `contract`, manteniendo convivencia sin romper lo existente.

## Estado real (25/05/2026)
- Fase 1: completada y validada en ejecucion real (tablas nuevas creadas, FK a `proveedores.id` BIGINT, bootstrap operativo).
- Fase 2: completada (`comparativos_schemas.py` creado con schemas create/update/read del flujo nuevo).
- Fase 2.1: completada (alineacion de `tenant_id` en todas las tablas nuevas, incluidos modelos + BD + schemas).
- Fase 3: implementada a nivel de codigo (`comparativos_v2/repo.py`, `service.py`, `__init__.py`).
- Fase 3: pendiente de integracion en router y validacion funcional end-to-end.

## Reglas cerradas
- Nombres nuevos en espanol.
- El comparativo nuevo NO se guarda en `contract`.
- `cif` y `razon_social` no se persisten en `comparativos`; se resuelven desde `proveedores`.
- `proveedores` es la tabla maestra; `supplier` queda fuera del flujo nuevo.
- FK nuevas a `proveedores.id` con BIGINT explicito.
- Todas las tablas nuevas llevan `tenant_id`.
- Hitos, aprobaciones e historial de flujo van en tablas separadas.

## Tablas nuevas del flujo
- `comparativos`
- `comparativo_hitos`
- `comparativo_aprobaciones`
- `comparativo_historial_flujo`
- `comparativo_oferta_adjudicada`
- `comparativo_oferta_adjudicada_partidas`
- `comparativo_oferta_descartada`
- `comparativo_oferta_descartada_partidas`
- `contratos`
- `contrato_datos_proveedor`
- `contrato_hitos`
- `contrato_historial_flujo`

## Pendiente inmediato
- Fase 4: router nuevo para el flujo `comparativos_v2`.
- Validacion funcional real del servicio nuevo en el entorno backend.
