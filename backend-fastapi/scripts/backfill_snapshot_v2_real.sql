BEGIN;

CREATE TEMP TABLE tmp_backfill_target (
    contrato_id INT PRIMARY KEY,
    tenant_id INT NOT NULL,
    comparativo_id INT NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_backfill_target (contrato_id, tenant_id, comparativo_id)
SELECT c.id, c.tenant_id, c.comparativo_id
FROM public.contratos c
WHERE c.comparativo_id IS NOT NULL
  AND c.eliminado_en IS NULL;

CREATE TEMP TABLE tmp_backfill_source ON COMMIT DROP AS
SELECT
    t.contrato_id,
    t.tenant_id,
    t.comparativo_id,
    c.estado AS contrato_estado,
    c.tipo_contrato AS contrato_tipo_contrato,
    c.numero_obra,
    c.nombre_obra,
    c.titulo,
    c.proveedor_id AS contrato_proveedor_id,
    comp.estado AS comparativo_estado,
    comp.tipo_contrato AS comparativo_tipo_contrato,
    comp.forma_pago,
    comp.terminos_pago,
    comp.numero_trabajadores_obra,
    comp.retencion_garantias,
    comp.descripcion_garantias,
    dp.cif AS proveedor_cif,
    COALESCE(dp.razon_social, dp.empresa) AS proveedor_razon_social,
    COALESCE(hs.hito_count, 0) AS hito_count,
    oa.id AS origen_oferta_id,
    oa.proveedor_id AS origen_oferta_proveedor_id,
    oa.empresa AS origen_oferta_empresa,
    oa.numero_oferta AS origen_numero_oferta,
    oa.total_ofertado AS origen_total_ofertado,
    oa.total_ofertas_homogeneas AS origen_total_ofertas_homogeneas,
    oa.precio_neto AS origen_precio_neto,
    oa.observaciones_oferta AS origen_observaciones,
    oa.garantias AS origen_garantias,
    oa.retenciones AS origen_retenciones,
    oa.plazos AS origen_plazos,
    COALESCE(op.origen_partidas_count, 0) AS origen_partidas_count,
    cta.id AS snapshot_oferta_id,
    COALESCE(sp.snapshot_partidas_count, 0) AS snapshot_partidas_count
FROM tmp_backfill_target t
JOIN public.contratos c
  ON c.id = t.contrato_id
LEFT JOIN public.comparativos comp
  ON comp.id = t.comparativo_id
LEFT JOIN public.contrato_datos_proveedor dp
  ON dp.contrato_id = t.contrato_id
LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS hito_count
    FROM public.contrato_hitos h
    WHERE h.contrato_id = t.contrato_id
) hs ON TRUE
LEFT JOIN LATERAL (
    SELECT oa1.*
    FROM public.comparativo_oferta_adjudicada oa1
    WHERE oa1.comparativo_id = t.comparativo_id
    ORDER BY oa1.id ASC
    LIMIT 1
) oa ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS origen_partidas_count
    FROM public.comparativo_oferta_adjudicada_partidas p
    WHERE p.comparativo_oferta_adjudicada_id = oa.id
) op ON TRUE
LEFT JOIN public.contrato_oferta_adjudicada cta
  ON cta.contrato_id = t.contrato_id
LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS snapshot_partidas_count
    FROM public.contrato_oferta_adjudicada_partidas p
    WHERE p.contrato_id = t.contrato_id
) sp ON TRUE;

CREATE TEMP TABLE tmp_backfill_log (
    contrato_id INT PRIMARY KEY,
    comparativo_id INT NOT NULL,
    json_updated BOOLEAN NOT NULL DEFAULT FALSE,
    oferta_snapshot_created BOOLEAN NOT NULL DEFAULT FALSE,
    partidas_snapshot_created INT NOT NULL DEFAULT 0,
    skipped_reason TEXT NULL
) ON COMMIT DROP;

INSERT INTO tmp_backfill_log (contrato_id, comparativo_id)
SELECT contrato_id, comparativo_id
FROM tmp_backfill_target;

WITH payload AS (
    SELECT
        s.contrato_id,
        COALESCE(c.datos_contractuales_json, '{}'::JSONB) AS existing_json,
        JSONB_STRIP_NULLS(
            JSONB_BUILD_OBJECT(
                'schema_version', 'contratos_v2_snapshot_2026_05',
                'snapshot_source', 'comparativo_v2_backfill',
                'backfill_version', 'snapshot_v2_real_2026-05-27',
                'backfill_created_at', TO_JSONB(NOW()),
                'comparativo_id', s.comparativo_id,
                'comparativo_estado', s.comparativo_estado,
                'tipo_contrato', COALESCE(s.contrato_tipo_contrato, s.comparativo_tipo_contrato),
                'numero_obra', s.numero_obra,
                'nombre_obra', s.nombre_obra,
                'titulo', s.titulo,
                'proveedor_id', s.contrato_proveedor_id,
                'proveedor_cif', s.proveedor_cif,
                'proveedor_razon_social', s.proveedor_razon_social,
                'forma_pago', s.forma_pago,
                'terminos_pago', s.terminos_pago,
                'numero_trabajadores_obra', s.numero_trabajadores_obra,
                'retencion_garantias', s.retencion_garantias,
                'descripcion_garantias', s.descripcion_garantias,
                'origen_oferta_disponible', (s.origen_oferta_id IS NOT NULL),
                'origen_partidas_count', s.origen_partidas_count,
                'hitos_snapshot_count', s.hito_count
            )
        ) AS patch_json
    FROM tmp_backfill_source s
    JOIN public.contratos c
      ON c.id = s.contrato_id
), missing AS (
    SELECT
        p.contrato_id,
        p.existing_json,
        COALESCE(
            (
                SELECT JSONB_OBJECT_AGG(e.key, e.value)
                FROM JSONB_EACH(p.patch_json) AS e
                WHERE NOT (p.existing_json ? e.key)
            ),
            '{}'::JSONB
        ) AS missing_json
    FROM payload p
), upd AS (
    UPDATE public.contratos c
    SET
        datos_contractuales_json = m.existing_json || m.missing_json,
        fecha_actualizacion = NOW()
    FROM missing m
    WHERE c.id = m.contrato_id
      AND m.missing_json <> '{}'::JSONB
    RETURNING c.id
)
UPDATE tmp_backfill_log l
SET json_updated = TRUE
FROM upd
WHERE l.contrato_id = upd.id;

WITH ins AS (
    INSERT INTO public.contrato_oferta_adjudicada (
        tenant_id,
        contrato_id,
        comparativo_oferta_adjudicada_id,
        proveedor_id,
        proveedor_nombre_snapshot,
        numero_oferta,
        total_ofertado,
        total_ofertas_homogeneas,
        precio_neto,
        forma_pago,
        plazo,
        observaciones,
        condiciones_json,
        fecha_creacion,
        fecha_actualizacion
    )
    SELECT
        s.tenant_id,
        s.contrato_id,
        s.origen_oferta_id,
        COALESCE(s.origen_oferta_proveedor_id, s.contrato_proveedor_id),
        s.origen_oferta_empresa,
        s.origen_numero_oferta,
        s.origen_total_ofertado,
        s.origen_total_ofertas_homogeneas,
        s.origen_precio_neto,
        s.forma_pago,
        s.origen_plazos,
        s.origen_observaciones,
        JSONB_STRIP_NULLS(
            JSONB_BUILD_OBJECT(
                'source', 'backfill_snapshot_v2_real',
                'comparativo_id', s.comparativo_id,
                'garantias', s.origen_garantias,
                'retenciones', s.origen_retenciones
            )
        ),
        NOW(),
        NOW()
    FROM tmp_backfill_source s
    WHERE s.origen_oferta_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM public.contrato_oferta_adjudicada x
          WHERE x.contrato_id = s.contrato_id
      )
    RETURNING contrato_id
)
UPDATE tmp_backfill_log l
SET oferta_snapshot_created = TRUE
FROM ins
WHERE l.contrato_id = ins.contrato_id;

CREATE TEMP TABLE tmp_offer_map ON COMMIT DROP AS
SELECT
    s.contrato_id,
    COALESCE(cta.comparativo_oferta_adjudicada_id, s.origen_oferta_id) AS origen_oferta_id,
    cta.id AS snapshot_oferta_id
FROM tmp_backfill_source s
JOIN public.contrato_oferta_adjudicada cta
  ON cta.contrato_id = s.contrato_id;

WITH ins_partidas AS (
    INSERT INTO public.contrato_oferta_adjudicada_partidas (
        tenant_id,
        contrato_id,
        contrato_oferta_adjudicada_id,
        comparativo_partida_adjudicada_id,
        codigo,
        descripcion,
        unidad,
        cantidad,
        precio_unitario,
        importe,
        orden,
        metadata_json,
        fecha_creacion,
        fecha_actualizacion
    )
    SELECT
        s.tenant_id,
        s.contrato_id,
        om.snapshot_oferta_id,
        coap.id,
        coap.codigo_capitulo,
        coap.descripcion,
        coap.unidad,
        coap.medicion,
        coap.precio,
        coap.importe,
        coap.orden,
        JSONB_BUILD_OBJECT(
            'source', 'backfill_snapshot_v2_real',
            'comparativo_oferta_adjudicada_id', coap.comparativo_oferta_adjudicada_id
        ),
        NOW(),
        NOW()
    FROM tmp_backfill_source s
    JOIN tmp_offer_map om
      ON om.contrato_id = s.contrato_id
    JOIN public.comparativo_oferta_adjudicada_partidas coap
      ON coap.comparativo_oferta_adjudicada_id = om.origen_oferta_id
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.contrato_oferta_adjudicada_partidas p
        WHERE p.contrato_id = s.contrato_id
          AND p.comparativo_partida_adjudicada_id = coap.id
    )
    RETURNING contrato_id
), cnt AS (
    SELECT contrato_id, COUNT(*)::INT AS partidas_creadas
    FROM ins_partidas
    GROUP BY contrato_id
)
UPDATE tmp_backfill_log l
SET partidas_snapshot_created = cnt.partidas_creadas
FROM cnt
WHERE l.contrato_id = cnt.contrato_id;

UPDATE tmp_backfill_log l
SET skipped_reason = CASE
    WHEN l.oferta_snapshot_created = FALSE
         AND COALESCE(s.snapshot_oferta_id, 0) = 0
         AND s.origen_oferta_id IS NULL
         AND l.partidas_snapshot_created = 0
      THEN 'no_origin_offer'
    WHEN l.json_updated = FALSE
         AND l.oferta_snapshot_created = FALSE
         AND l.partidas_snapshot_created = 0
      THEN 'no_changes'
    ELSE NULL
END
FROM tmp_backfill_source s
WHERE s.contrato_id = l.contrato_id;

SELECT
    COUNT(*)::INT AS contratos_procesados,
    COUNT(*) FILTER (
      WHERE json_updated OR oferta_snapshot_created OR partidas_snapshot_created > 0
    )::INT AS contratos_actualizados,
    COALESCE(SUM(CASE WHEN oferta_snapshot_created THEN 1 ELSE 0 END), 0)::INT AS ofertas_snapshot_creadas,
    COALESCE(SUM(partidas_snapshot_created), 0)::INT AS partidas_snapshot_creadas,
    COALESCE(SUM(CASE WHEN skipped_reason IS NOT NULL THEN 1 ELSE 0 END), 0)::INT AS contratos_saltados
FROM tmp_backfill_log;

SELECT
    contrato_id,
    comparativo_id,
    json_updated,
    oferta_snapshot_created,
    partidas_snapshot_created,
    skipped_reason
FROM tmp_backfill_log
ORDER BY contrato_id;

COMMIT;
