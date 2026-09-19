-- =============================================================================
-- Segmentacion de comunicados por version de la app
-- =============================================================================
-- Objetivo: permitir que un comunicado se muestre solo a usuarios en la
-- ultima version instalada (Vxxxx), solo a usuarios en versiones anteriores
-- a esa, o a todos (comportamiento actual, por defecto).
--
-- El filtrado real ocurre en el cliente (useComunicados.ts), comparando
-- target_version_code contra el version_code que ya reporta expo-application
-- en ese dispositivo (el mismo dato que usa el flujo de actualizacion OTA
-- en useOTAUpdate.ts). No se necesita registrar la version de cada usuario
-- en el servidor: el propio dispositivo ya sabe que version tiene instalada.
--
-- target_scope:
--   'all'      -> visible para todos (default, compatibilidad con filas viejas)
--   'latest'   -> visible solo si version_code_dispositivo >= target_version_code
--   'previous' -> visible solo si version_code_dispositivo <  target_version_code
--
-- target_version_code guarda el version_code de public.version_apk vigente
-- al momento de crear el comunicado (la "ultima version" en ese instante).
-- =============================================================================

ALTER TABLE public.app_comunicados
  ADD COLUMN IF NOT EXISTS target_scope TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.app_comunicados
  ADD COLUMN IF NOT EXISTS target_version_code INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_comunicados_target_scope_check'
  ) THEN
    ALTER TABLE public.app_comunicados
      ADD CONSTRAINT app_comunicados_target_scope_check
      CHECK (target_scope IN ('all', 'latest', 'previous'));
  END IF;
END $$;
