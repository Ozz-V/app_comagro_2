-- Modificación del trigger para evitar falsos positivos en upserts parciales
-- donde la app no envía explícitamente el campo `role`, previniendo que
-- asuma un cambio a NULL y rechace la operación para usuarios Staff.

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Si el upsert de la app omitió el rol (lo manda como NULL), restauramos el viejo
  IF NEW.role IS NULL THEN
    NEW.role = OLD.role;
  END IF;

  -- Ahora sí, evaluamos la seguridad real
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('role', true) IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'No autorizado para modificar el rol de un perfil';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
