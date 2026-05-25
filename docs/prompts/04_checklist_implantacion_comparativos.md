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

## Fase 3.1 - Integracion en endpoints legacy de contratos (sin router nuevo)
- [x] Mantener endpoints existentes de contratos (`/api/v1/contracts/...`)
- [x] Integrar `ComparativosV2Service` dentro de `contracts/_internal/comparatives_service.py`
- [x] Mantener nombres publicos legacy (`save_draft`, `submit`, `approve`, `reject`, `return_comparative`, etc.)
- [x] Mantener retorno `Contract` legacy para compatibilidad con `contracts_service.build_read(...)`
- [x] Guardar vinculo legacy->v2 en `contract.comparative_data[\"_v2\"][\"comparativo_id\"]`
- [x] Mapear estados v2 (`BORRADOR`, `PENDIENTE_APROBACION`, `APROBADO`, `RECHAZADO`, `NECESITA_CAMBIOS`) a `ComparativeStatus` legacy
- [x] Migrar `approve`, `reject` y `return_comparative` a v2 cuando existe vinculo `_v2`
- [x] Migrar `submit` a v2 con creacion condicional y fallback legacy controlado
- [x] Mantener `save_draft` en legacy con sincronizacion best-effort a v2 si existe vinculo
- [x] Mantener fallback legacy para funciones no cubiertas (`get_comparative_offers`, `sync_offer_ids`, `add_offer`, `select_offer`, `validate_rea`, `send_supplier_form_after_approval`, `rebuild`)
- [x] Validacion sintactica con `py_compile`:
- [x] `app/domains/procurement/contracts/_internal/comparatives_service.py`
- [x] `app/domains/procurement/comparativos_v2/service.py`
- [x] `app/domains/procurement/comparativos_v2/repo.py`
- [ ] Validacion funcional end-to-end en runtime backend

## Fase 4+
- [ ] Router nuevo de comparativos
- [ ] Tests del flujo nuevo
- [ ] Generacion real de contrato desde comparativo aprobado
