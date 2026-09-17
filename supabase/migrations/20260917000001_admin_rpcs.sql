-- ==============================================================================
-- Migración: Admin RPCs
-- ==============================================================================
-- Permite a los usuarios con rol 'admin' modificar la tabla perfiles de otros 
-- usuarios sin exponer UPDATE directo por RLS a todos.

CREATE OR REPLACE FUNCTION public.admin_set_role(target_user_id UUID, new_role TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Verificar que el llamador sea un admin
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role != 'admin' THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador.';
  END IF;

  -- Actualizar el rol
  UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ban_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Verificar que el llamador sea un admin
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role != 'admin' THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador.';
  END IF;

  -- Para banear, podemos usar una columna is_banned si existe, o setear el rol a 'banned'
  -- Asumiendo que seteamos el rol a 'banned'
  UPDATE public.profiles SET role = 'banned' WHERE id = target_user_id;
END;
$$;
