-- ============================================================
-- Fix: escalacion de privilegios via profiles.role + RLS de version_apk
-- ============================================================

-- 1. Helper: ¿el usuario autenticado actual es admin?
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

-- 2. Bloquear que un usuario se auto-asigne role='admin'
--    editando su propio perfil.
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado para modificar el rol de un perfil';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_escalation();

-- 3. Restringir escritura en version_apk a admins reales.
--    La lectura publica ("Lectura publica version") no se toca.
DROP POLICY IF EXISTS "Admin manage versions" ON public.version_apk;
CREATE POLICY "Admin manage versions" ON public.version_apk
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
