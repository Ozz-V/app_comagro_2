-- ============================================================
-- Fix: policy PERMISSIVE duplicada en version_apk anulaba el
-- fix de escalación de privilegios de 20260713220000.
--
-- Contexto (auditoría 2026-09-14, repo app_comagro_2 @ 6b30f48):
-- La migración 20260713220000_fix_version_apk_rls_role_escalation.sql
-- recreó "Admin manage versions" para exigir is_admin(), pero nunca
-- eliminó "Autenticados gestionan version" (USING true, WITH CHECK
-- true, para cualquier authenticated). Como las policies PERMISSIVE
-- se combinan con OR, la policy vieja anulaba el fix por completo:
-- cualquier usuario autenticado podía escribir download_url,
-- sha256_hash o version_code y forzar la instalación de un APK
-- arbitrario o un downgrade malicioso.
--
-- Este fix ya fue aplicado a mano en producción el 2026-09-14.
-- Esta migración solo lo deja reflejado en el historial para que
-- `supabase db push` / `supabase db diff` no marquen drift.
-- ============================================================

DROP POLICY IF EXISTS "Autenticados gestionan version" ON public.version_apk;

-- Re-declarar de forma idempotente el estado correcto por si esta
-- migración corre en un entorno donde 20260713220000 no se aplicó
-- limpia (ver nota de la auditoría sobre historial vs. estado real).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

DROP POLICY IF EXISTS "Admin manage versions" ON public.version_apk;
CREATE POLICY "Admin manage versions" ON public.version_apk
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Lectura publica version" ON public.version_apk;
CREATE POLICY "Lectura publica version" ON public.version_apk
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true);
