-- Contratos v2: campo JSON controlado para datos especificos por tipo.
-- Seguro en ejecuciones repetidas.
ALTER TABLE public.contratos
ADD COLUMN IF NOT EXISTS datos_contractuales_json JSONB;
