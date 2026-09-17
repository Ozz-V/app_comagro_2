
-- Permitir que Supabase Studio y service_role puedan editar roles.
-- La version anterior bloqueaba a todo aquel que no tuviera auth.uid() como admin, 
-- incluyendo al propio administrador de base de datos desde la consola.

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Si la consulta viene de PostgREST (API), el rol ser 'anon' o 'authenticated'
    -- Si viene de Supabase Studio o service_key, ser 'postgres' o 'service_role'
    IF current_setting('role', true) IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'No autorizado para modificar el rol de un perfil';
    END IF;
  END IF;
  RETURN NEW;
END;
$function;
