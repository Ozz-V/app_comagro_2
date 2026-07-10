-- Migración: Restringir acceso solo a usuarios con correo @comagro.com.py
-- Esto cierra la vulnerabilidad reportada de depender exclusivamente del frontend.

-- Función para validar el dominio en el token JWT del usuario activo
CREATE OR REPLACE FUNCTION public.is_comagro_user()
RETURNS boolean AS $$
BEGIN
  RETURN (auth.jwt() ->> 'email') ILIKE '%@comagro.com.py';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentario: Para aplicar esto a las tablas, deberías actualizar las políticas RLS existentes.
-- Por ejemplo, si tienes una tabla "profiles":
-- 
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY "Permitir lectura a empleados de Comagro" ON public.profiles
--   FOR SELECT USING (public.is_comagro_user());
-- 
-- CREATE POLICY "Permitir escritura a empleados de Comagro" ON public.profiles
--   FOR ALL USING (public.is_comagro_user());

-- (Nota: Esto es un template. Ajusta las políticas exactas a las tablas reales de tu esquema)
