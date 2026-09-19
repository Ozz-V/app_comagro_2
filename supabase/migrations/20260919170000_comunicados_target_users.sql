-- =============================================================================
-- Comunicados dirigidos a usuarios especificos
-- =============================================================================
-- Ademas de la segmentacion por version (target_scope / target_version_code,
-- migracion 20260919150000), un comunicado ahora puede ir dirigido a uno o
-- varios usuarios puntuales (ej: saludo de cumpleaños, aviso personal).
--
-- target_user_ids:
--   NULL (default)   -> comunicado global, sigue las reglas normales de
--                        target_scope / target_version_code.
--   {uuid, uuid, ...} -> comunicado PERSONALIZADO: solo esos usuarios lo ven,
--                        sin importar su version instalada. target_scope se
--                        ignora en ese caso (lo aplican tanto el filtro
--                        cliente en useComunicados.ts como comunicado-notify).
--
-- La politica de lectura publica se ajusta para que un comunicado
-- personalizado no le llegue a nadie mas: antes, cualquier usuario
-- autenticado (o incluso anonimo) podia hacer select(*) sobre todos los
-- comunicados activos sin importar a quien estuvieran dirigidos.
-- =============================================================================

ALTER TABLE public.app_comunicados
  ADD COLUMN IF NOT EXISTS target_user_ids UUID[];

DROP POLICY IF EXISTS "Lectura publica de comunicados activos" ON public.app_comunicados;

CREATE POLICY "Lectura publica de comunicados activos"
  ON public.app_comunicados
  FOR SELECT
  USING (
    is_active = true
    AND (target_user_ids IS NULL OR auth.uid() = ANY(target_user_ids))
  );
