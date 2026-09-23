CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- 1. PREVENIR BORRADO ACCIDENTAL DE DATOS EN UPSERTS PARCIALES
  -- Si la app envia un upsert que omite estos campos, evitamos que se conviertan en NULL
  IF NEW.role IS NULL THEN NEW.role = OLD.role; END IF;
  IF NEW.installed_version_code IS NULL THEN NEW.installed_version_code = OLD.installed_version_code; END IF;
  IF NEW.installed_version_name IS NULL THEN NEW.installed_version_name = OLD.installed_version_name; END IF;
  IF NEW.expo_push_token IS NULL THEN NEW.expo_push_token = OLD.expo_push_token; END IF;
  IF NEW.version_updated_at IS NULL THEN NEW.version_updated_at = OLD.version_updated_at; END IF;

  -- 2. VALIDAR SEGURIDAD DEL ROL
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('role', true) IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
      IF NEW.role = 'admin' THEN
        RAISE EXCEPTION 'No autorizado para modificar el rol de un perfil';
      END IF;
      IF OLD.role IS NULL THEN
         RETURN NEW;
      END IF;
      RAISE EXCEPTION 'No autorizado para modificar el rol de un perfil';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
