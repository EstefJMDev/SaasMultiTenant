-- Backfill temporal Camino J minimo para contratos legacy enlazados a comparativos v2.
-- Uso recomendado: ejecutar primero el SELECT de candidatos y despues el UPDATE en una ventana controlada.

-- Candidatos:
SELECT
    c.id AS legacy_contract_id,
    c.status,
    c.comparative_status,
    c.template_id,
    c.comparative_data->'_v2'->>'comparativo_id' AS comparativo_id,
    comp.contrato_id
FROM public.contract c
JOIN public.comparativos comp
    ON comp.id::text = c.comparative_data->'_v2'->>'comparativo_id'
WHERE c.comparative_data->'_v2'->>'comparativo_id' IS NOT NULL
  AND c.comparative_status = 'APPROVED'
  AND c.status = 'DRAFT'
  AND c.template_id IS NULL
  AND comp.contrato_id IS NOT NULL
ORDER BY c.id;

BEGIN;

WITH candidates AS (
    SELECT
        c.id AS legacy_contract_id,
        comp.id AS comparativo_id,
        comp.contrato_id
    FROM public.contract c
    JOIN public.comparativos comp
        ON comp.id::text = c.comparative_data->'_v2'->>'comparativo_id'
    WHERE c.comparative_data->'_v2'->>'comparativo_id' IS NOT NULL
      AND c.comparative_status = 'APPROVED'
      AND c.status = 'DRAFT'
      AND c.template_id IS NULL
      AND comp.contrato_id IS NOT NULL
),
updated AS (
    UPDATE public.contract c
    SET status = 'PENDING_TEMPLATE',
        comparative_status = 'APPROVED',
        comparative_data = jsonb_set(
            COALESCE(c.comparative_data, '{}'::jsonb),
            '{_v2}',
            COALESCE(c.comparative_data->'_v2', '{}'::jsonb)
                || jsonb_build_object(
                    'comparativo_id', candidates.comparativo_id,
                    'contrato_id', candidates.contrato_id,
                    'estado', 'APROBADO'
                ),
            true
        ),
        updated_at = NOW()
    FROM candidates
    WHERE c.id = candidates.legacy_contract_id
    RETURNING
        c.id AS legacy_contract_id,
        c.status,
        c.comparative_status,
        c.template_id,
        c.comparative_data->'_v2' AS v2_link
)
SELECT *
FROM updated
ORDER BY legacy_contract_id;

COMMIT;
