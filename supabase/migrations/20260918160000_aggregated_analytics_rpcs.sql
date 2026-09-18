-- ==============================================================================
-- Nuevas RPCs de analytics agregadas en el servidor
-- Reemplaza el enfoque de "traer filas crudas al cliente" por agregaciones
-- directas en Postgres. Esto garantiza:
--   1) Datos coherentes entre Metricas, Contactos y PDFs
--   2) Tamaño de respuesta fijo (~10-100 filas) sin importar años de datos
--   3) Filtrado por periodo estandar (today/7d/30d/all)
-- ==============================================================================

-- Helper: convierte el string de periodo a un timestamp de inicio
CREATE OR REPLACE FUNCTION public.period_start(p_period text)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_period
    WHEN 'today' THEN date_trunc('day', now() AT TIME ZONE 'UTC')
    WHEN '7d'    THEN now() - INTERVAL '7 days'
    WHEN '30d'   THEN now() - INTERVAL '30 days'
    ELSE         '1970-01-01'::timestamptz
  END;
$$;

-- 1. KPIs globales por periodo: vistas, compartidos, usuarios activos
CREATE OR REPLACE FUNCTION public.get_global_kpis(p_period text DEFAULT 'all')
RETURNS TABLE(views bigint, shares bigint, active_users bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE action = 'view') AS views,
    COUNT(*) FILTER (WHERE action IN ('share_pdf','share_image')) AS shares,
    COUNT(DISTINCT user_email) FILTER (WHERE user_email != 'offline_user') AS active_users
  FROM public.producto_analytics
  WHERE created_at >= public.period_start(p_period);
$$;
GRANT EXECUTE ON FUNCTION public.get_global_kpis(text) TO authenticated;

-- 2. Top productos mas vistos por periodo
CREATE OR REPLACE FUNCTION public.get_top_products_by_period(p_period text DEFAULT 'all', p_limit int DEFAULT 10)
RETURNS TABLE(modelo text, marca text, sku text, views bigint, shares bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    modelo,
    marca,
    COALESCE(sku, modelo) AS sku,
    COUNT(*) FILTER (WHERE action = 'view') AS views,
    COUNT(*) FILTER (WHERE action IN ('share_pdf','share_image')) AS shares
  FROM public.producto_analytics
  WHERE created_at >= public.period_start(p_period)
    AND (modelo IS NOT NULL OR sku IS NOT NULL)
  GROUP BY modelo, marca, sku
  ORDER BY views DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_products_by_period(text, int) TO authenticated;

-- 3. Top marcas mas activas por periodo
CREATE OR REPLACE FUNCTION public.get_top_brands_by_period(p_period text DEFAULT 'all', p_limit int DEFAULT 10)
RETURNS TABLE(marca text, views bigint, shares bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    marca,
    COUNT(*) FILTER (WHERE action = 'view') AS views,
    COUNT(*) FILTER (WHERE action IN ('share_pdf','share_image')) AS shares
  FROM public.producto_analytics
  WHERE created_at >= public.period_start(p_period)
    AND marca IS NOT NULL
  GROUP BY marca
  ORDER BY views DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_brands_by_period(text, int) TO authenticated;

-- 4. Top usuarios mas activos por periodo (solo para admins)
CREATE OR REPLACE FUNCTION public.get_top_users_by_period(p_period text DEFAULT 'all', p_limit int DEFAULT 10)
RETURNS TABLE(user_email text, views bigint, shares bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    user_email,
    COUNT(*) FILTER (WHERE action = 'view') AS views,
    COUNT(*) FILTER (WHERE action IN ('share_pdf','share_image')) AS shares
  FROM public.producto_analytics
  WHERE created_at >= public.period_start(p_period)
    AND user_email != 'offline_user'
  GROUP BY user_email
  ORDER BY (COUNT(*) FILTER (WHERE action = 'view') + COUNT(*) FILTER (WHERE action IN ('share_pdf','share_image'))) DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_users_by_period(text, int) TO authenticated;

-- 5. Resumen de un usuario puntual por periodo (para Contactos - 30 dias)
CREATE OR REPLACE FUNCTION public.get_user_analytics_summary_by_period(p_email text, p_period text DEFAULT '30d')
RETURNS TABLE(views bigint, shares bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE action = 'view') AS views,
    COUNT(*) FILTER (WHERE action IN ('share_pdf','share_image')) AS shares
  FROM public.producto_analytics
  WHERE user_email = p_email
    AND created_at >= public.period_start(p_period);
$$;
GRANT EXECUTE ON FUNCTION public.get_user_analytics_summary_by_period(text, text) TO authenticated;