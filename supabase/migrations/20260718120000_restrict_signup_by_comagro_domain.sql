-- Migration: 20260718120000_restrict_signup_by_comagro_domain.sql
-- Goal: Restaurar el autoregistro (shouldCreateUser: true) sin reabrir el
-- hueco de seguridad C-2 del audit del 16/07. La validación de dominio
-- @comagro.com.py ahora se hace del lado del servidor (Postgres), vía el
-- hook "Before User Created" de Supabase Auth. La app YA NO es la única
-- barrera: aunque alguien llame a la API directo, Supabase rechaza la
-- creación del usuario si el email no es @comagro.com.py.

create or replace function public.hook_restrict_signup_by_comagro_domain(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  email text;
begin
  email := lower(event->'user'->>'email');

  if email ~ '^[a-z0-9._%+-]+@comagro\.com\.py$' then
    -- Dominio corporativo válido: se permite la creación del usuario.
    return '{}'::jsonb;
  end if;

  -- Cualquier otro dominio: se rechaza con mensaje explícito para el cliente.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Solo se permiten correos @comagro.com.py',
      'http_code', 403
    )
  );
end;
$$;

-- Permisos: solo el rol interno de Supabase Auth puede ejecutar esta función.
-- Nunca debe ser invocable por usuarios anónimos/autenticados directamente.
grant execute
  on function public.hook_restrict_signup_by_comagro_domain
  to supabase_auth_admin;

revoke execute
  on function public.hook_restrict_signup_by_comagro_domain
  from authenticated, anon, public;