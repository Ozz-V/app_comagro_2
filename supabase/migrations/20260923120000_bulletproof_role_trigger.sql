CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- 1. Si es la creacion del usuario (INSERT), dejarlo pasar libremente
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- 2. Si es una actualizacion y no enviaron rol, mantener el que ya tenia
  IF NEW.role IS NULL THEN
    NEW.role = OLD.role;
  END IF;

  -- 3. Si hubo un cambio real en el rol
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('role', true) IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
      
      -- Prohibir estrictamente auto-asignarse admin
      IF NEW.role = 'admin' THEN
        RAISE EXCEPTION 'No autorizado para modificar el rol de un perfil';
      END IF;

      -- Si es un usuario nuevo que pasa de NULL a un rol por defecto (ej. 'staff'), permitirlo
      IF OLD.role IS NULL THEN
         RETURN NEW;
      END IF;

      -- Bloquear cualquier otro intento de cambiar el rol existente
      RAISE EXCEPTION 'No autorizado para modificar el rol de un perfil';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
