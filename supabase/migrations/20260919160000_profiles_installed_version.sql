-- =============================================================================
-- Version de APK instalada por usuario (self-reportada por la propia app)
-- =============================================================================
-- Cada dispositivo reporta su propio version_code/version_name al iniciar
-- sesion (App.tsx, en el mismo upsert donde ya se guarda expo_push_token).
-- Esto permite:
--   1. Verlo en el Panel de Control (AdminUsersScreen: columna "Version").
--   2. Filtrar comunicados por version en el server (comunicado-notify),
--      ademas del filtro que ya hace cada dispositivo localmente.
--   3. A futuro, dirigir comunicados a usuarios puntuales sabiendo que
--      version tienen instalada.
--
-- IMPORTANTE: esto solo lo reportan usuarios que ya actualizaron a una APK
-- que incluya este cambio (App.tsx). Usuarios en versiones anteriores a esta
-- feature van a aparecer con installed_version_code = NULL hasta que
-- actualicen al menos una vez con la nueva version.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS installed_version_code INTEGER;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS installed_version_name TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS version_updated_at TIMESTAMP WITH TIME ZONE;
