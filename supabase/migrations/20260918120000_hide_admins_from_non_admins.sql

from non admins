-- ==============================================================================
-- Regla de producto: un usuario NO admin nunca debe ver a un admin listado
-- en ninguna parte de la app (Contactos, "Usuario Más Activo", rankings, etc).
--
-- El directorio de Contactos y el ranking "usuarios" de Métricas de Negocio ya
-- se filtran del lado del cliente (la tabla profiles es legible por cualquier
-- autenticado vía RLS "Autenticados ven perfiles", así que el cliente puede
-- filtrar por role sin necesidad de tocar la base).
--
-- Pero get_most_active_user() es SECURITY DEFINER: agrega y decide el ganador
-- DENTRO de la base, así que si el más activo de toda la app es un admin, el
-- cliente nunca se entera de que existe un segundo lugar no-admin al cual
-- mostrar en su lugar. Ese filtro tiene que vivir aquí.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_most_active_user()
RETURNS TABLE(user_email text, views bigint, shares bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    pa.user_email,
    COUNT(*) FILTER (WHERE pa.action = 'view') AS views,
    COUNT(*) FILTER (WHERE pa.action IN ('share_pdf', 'share_image')) AS shares
  FROM public.producto_analytics pa
  LEFT JOIN public.profiles p ON p.email = pa.user_email
  WHERE pa.user_email IS NOT NULL
    -- Si quien pregunta es admin, puede ver a cualquiera (incluidos otros admins).
    -- Si no es admin, se excluye a cualquier fila cuyo dueño sea admin y se
    -- pasa al siguiente más activo que no lo sea.
    AND (public.is_admin() OR p.role IS DISTINCT FROM 'admin')
  GROUP BY pa.user_email
  ORDER BY (COUNT(*) FILTER (WHERE pa.action = 'view') + COUNT(*) FILTER (WHERE pa.action IN ('share_pdf', 'share_image'))) DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_most_active_user() TO authenticated;
