# Checklist de implantacion - Comparativos / Contratos

## Fase 0 - Decisiones
- [x] Comparativo nuevo fuera de `contract`
- [x] `proveedores` como tabla maestra
- [x] `cif` y `razon_social` no se guardan en `comparativos`
- [x] FK nuevas a `proveedores.id` con BIGINT
- [x] Todas las tablas nuevas con `tenant_id`

## Fase 1 - Modelos + bootstrap
- [x] Enums del flujo nuevo
- [x] Modelos SQLModel nuevos
- [x] Registro en `app/db/base.py`
- [x] Guard de bootstrap para `proveedores`
- [x] Validacion real en ejecucion (`INIT_DB` + creacion de 12 tablas)

## Fase 2 - Schemas
- [x] `comparativos_schemas.py` creado
- [x] Schemas Create/Update/Read de comparativos
- [x] Schemas de hitos
- [x] Schemas de oferta adjudicada + partidas
- [x] Schemas de oferta descartada + partidas
- [x] Schemas de aprobaciones e historial
- [x] `cif` y `razon_social` como campos derivados de lectura

## Fase 2.1 - Correccion tenant_id (alineacion estructural)
- [x] Detectadas tablas nuevas sin `tenant_id`
- [x] Modelos SQLModel corregidos
- [x] Bootstrap idempotente para tablas ya existentes (ADD COLUMN + backfill + NOT NULL + FK + indice)
- [x] Validacion real en PostgreSQL: `tenant_id` presente en las 12 tablas nuevas

## Fase 3 - Services nuevo flujo comparativos
- [x] Crear modulo `comparativos_v2`
- [x] Crear `repo.py`
- [x] Crear `service.py`
- [x] Crear `__init__.py`
- [x] Crear/editar/obtener/listar comparativos
- [x] Persistir hitos/ofertas/historial/aprobaciones
- [x] Resolver lectura de `cif` y `razon_social` desde `proveedores`
- [x] Dejar stub controlado para `generar_contrato_desde_comparativo`
- [ ] Validacion funcional end-to-end del servicio en runtime backend

## Fase 4+
- [ ] Router nuevo de comparativos
- [ ] Tests del flujo nuevo
- [ ] Generacion real de contrato desde comparativo aprobado
