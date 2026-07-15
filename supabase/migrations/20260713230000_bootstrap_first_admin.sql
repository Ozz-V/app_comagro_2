-- ============================================================
-- Fix: permitir el arranque (bootstrap) del primer admin real
-- ============================================================

-- 1. Corregir la funcion del trigger: permitir el cambio de rol
--    SOLO si quien lo hace ya es admin, O si todavia no existe
--    ningun admin en el sistema (caso de arranque inicial).
--    Una vez que exista al menos un admin, esta excepcion se
--    cierra sola para siempre.
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_admin()
     AND EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin')
  THEN
    RAISE EXCEPTION 'No autorizado para modificar el rol de un perfil';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Designar al primer admin real.
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'ovilla@comagro.com.py';
