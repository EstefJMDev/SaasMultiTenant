# Decisiones confirmadas - Reestructuracion comparativos / contratos

## Modelo funcional
- El comparativo nuevo no se guarda en `contract`.
- El comparativo se edita sobrescribiendose (sin versionado de contenido).
- Hitos, aprobaciones e historial de flujo van en tablas separadas.
- El contrato se implementa despues, a partir de comparativo aprobado.

## Proveedores
- Tabla maestra del flujo nuevo: `proveedores`.
- `supplier` no se usa en el flujo nuevo.
- `cif` y `razon_social` se leen desde `proveedores`.
- `cif` y `razon_social` no se persisten en `comparativos`.
- FK nuevas a `proveedores.id` con tipo BIGINT explicito.

## Multi-tenant
- Todas las tablas nuevas deben llevar `tenant_id`.
- Regla ya alineada en modelos, BD y schemas tras Fase 2.1.

## Estructura nueva
- Tablas nuevas creadas y activas:
- `comparativos`, `comparativo_hitos`, `comparativo_aprobaciones`, `comparativo_historial_flujo`
- `comparativo_oferta_adjudicada`, `comparativo_oferta_adjudicada_partidas`
- `comparativo_oferta_descartada`, `comparativo_oferta_descartada_partidas`
- `contratos`, `contrato_datos_proveedor`, `contrato_hitos`, `contrato_historial_flujo`

## Estrategia tecnica vigente
- Convivencia con legacy sin romper flujos actuales.
- Bootstrap con `create_all()` + ajustes idempotentes para instalaciones existentes.
- No migrar legacy todavia.
- No tocar frontend todavia.
- Fase 3 implementada en modulo aislado `comparativos_v2`.
- Integracion por adaptador temporal en `contracts/_internal/comparatives_service.py`.
- Sin crear router nuevo `/api/v2/comparativos` en esta fase.
- Los endpoints legacy de contratos se mantienen y devuelven `Contract` legacy.

## Estado de fases
- Fase 1: completada/validada.
- Fase 2: completada.
- Fase 2.1: completada (tenant_id).
- Fase 3: implementada e integrada bajo endpoints legacy de contratos.
- Fase 3.1 (adaptador): implementada, pendiente validacion funcional runtime.
- Fase 4: no iniciada.
