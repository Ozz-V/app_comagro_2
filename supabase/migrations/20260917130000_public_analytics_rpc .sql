-- ==============================================================================
-- Fix: la migración 20260716200000_fix_analytics_rls.sql restringió
-- producto_analytics a "solo tus propias filas o ser admin". Eso rompió,
-- para cualquier usuario NO admin:
--   1) Contactos -> ver vistas/compartidos de otro usuario (salía todo en 0)
--   2) Producto Estrella (ranking global de todos los usuarios)
--   3) El nuevo panel "Usuario más activo"
--
-- Solución: en vez de abrir la tabla completa de nuevo (lo que expondría
-- fila por fila qué vio cada usuario, el bug de privacidad original que
-- 20260716200000 vino a corregir), exponemos funciones SECURITY DEFINER
-- que devuelven SOLO datos agregados (conteos), nunca las filas crudas.
-- Cualquier usuario autenticado puede llamarlas.
-- ==============================================================================

-- 1. Totales de un usuario puntual (para el detalle de Contactos/Directorio)
CREATE OR REPLACE FUNCTION public.get_user_analytics_summary(p_email text)
RETURNS TABLE(views bigint, shares bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE action = 'view') AS views,
    COUNT(*) FILTER (WHERE action IN ('share_pdf', 'share_image')) AS shares
  FROM public.producto_analytics
  WHERE user_email = p_email;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_analytics_summary(text) TO authenticated;

-- 2. Ranking global de SKUs (para "Producto Estrella"): agregado de TODOS
--    los usuarios, sin exponer quién vio qué.
CREATE OR REPLACE FUNCTION public.get_global_top_skus(p_limit int DEFAULT 5)
RETURNS TABLE(sku text, views bigint, shares bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    sku,
    COUNT(*) FILTER (WHERE action = 'view') AS views,
    COUNT(*) FILTER (WHERE action IN ('share_pdf', 'share_image')) AS shares
  FROM public.producto_analytics
  WHERE sku IS NOT NULL
  GROUP BY sku
  ORDER BY views DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_global_top_skus(int) TO authenticated;

-- 3. Usuario más activo de toda la app (para el nuevo panel en Mi Historial).
--    Devuelve solo el email + sus totales; el nombre/avatar se resuelve
--    aparte contra "profiles", que ya es legible por cualquier autenticado.
CREATE OR REPLACE FUNCTION public.get_most_active_user()
RETURNS TABLE(user_email text, views bigint, shares bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    user_email,
    COUNT(*) FILTER (WHERE action = 'view') AS views,
    COUNT(*) FILTER (WHERE action IN ('share_pdf', 'share_image')) AS shares
  FROM public.producto_analytics
  WHERE user_email IS NOT NULL
  GROUP BY user_email
  ORDER BY (COUNT(*) FILTER (WHERE action = 'view') + COUNT(*) FILTER (WHERE action IN ('share_pdf', 'share_image'))) DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_most_active_user() TO authenticated;

-- 4. Dataset agregado global para la pestaña "General" de Contactos/Métricas
--    (antes esta pestaña ni se pedía si el usuario no era admin, por eso
--    quedaba todo en 0 para cualquier usuario normal). Devuelve las mismas
--    columnas que ya se procesan en el cliente (useDashboardAnalyticsLogic),
--    filtradas por fecha, para que "Top vistos", "Top compartidos" y "Marcas"
--    salgan igual para todos los usuarios, no solo para admins.
CREATE OR REPLACE FUNCTION public.get_global_analytics_rows(p_since timestamptz DEFAULT NULL)
RETURNS TABLE(modelo text, marca text, sku text, action text, user_email text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT modelo, marca, sku, action, user_email, created_at
  FROM public.producto_analytics
  WHERE (p_since IS NULL OR created_at >= p_since)
  ORDER BY created_at DESC
  LIMIT 50000;
$$;

GRANT EXECUTE ON FUNCTION public.get_global_analytics_rows(timestamptz) TO authenticated;

-- 5. Feature flag para el nuevo panel "Usuario más activo"
INSERT INTO public.app_features (feature_key, is_enabled, label) VALUES
    ('usuario_mas_activo', true, 'Usuario Más Activo (Historial)')
ON CONFLICT (feature_key) DO NOTHING;
