-- ==============================================================================
-- Profesionalización de métricas: mover TODA la agregación al servidor.
--
-- Contexto: "Reporte Global" y "Usuario más activo" ya agregaban en Postgres
-- (ver 20260918160000_aggregated_analytics_rpcs.sql y
-- 20260917130000_public_analytics_rpc .sql). Pero quedaban tres puntos
-- trayendo FILAS CRUDAS al cliente y agregando en JavaScript:
--   1) "Mi Actividad" en el dashboard (useDashboardAnalyticsLogic.ts)
--   2) El PDF de "Reporte por Usuario" (pdfGridReport.ts) -- este ya tuvo
--      un bug real por esto (limit compartido entre usuarios sin ORDER BY,
--      corregido como parche del lado cliente con paginación)
--   3) Los paneles "Tus Productos Más Vistos / Compartidos / Marcas" en el
--      Historial (TopProductsPanel, TopSharedPanel, TopBrandsPanel), cada
--      uno con un .limit(200) fijo sobre filas crudas -- misma familia de
--      bug: si un usuario tiene más de 200 eventos, el ranking puede salir
--      incompleto o directamente incorrecto.
--
-- Esta migración agrega las funciones que faltaban para que NINGÚN reporte
-- ni panel necesite traer una fila cruda de producto_analytics al cliente:
-- todo el conteo/ranking se hace en Postgres, cacheable y correcto sin
-- importar el volumen histórico.
--
-- De paso corrige un bug de datos separado: en el Reporte Global,
-- "Top Productos Más Vistos" y "Top Productos Compartidos" usaban la MISMA
-- lista (ordenada por vistas+compartidos combinado) para ambas secciones --
-- se agregan versiones separadas, una ordenada por vistas y otra por
-- compartidos.
-- ==============================================================================

-- 1a. Top productos MÁS VISTOS (global) -- separado de "más compartidos".
CREATE OR REPLACE FUNCTION public.get_top_viewed_products_by_period(p_period text DEFAULT 'all', p_limit int DEFAULT 10)
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
GRANT EXECUTE ON FUNCTION public.get_top_viewed_products_by_period(text, int) TO authenticated;

-- 1b. Top productos MÁS COMPARTIDOS (global) -- ordenado por shares, no por
--     vistas+shares combinado como hacía get_top_products_by_period.
CREATE OR REPLACE FUNCTION public.get_top_shared_products_by_period(p_period text DEFAULT 'all', p_limit int DEFAULT 10)
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
  HAVING COUNT(*) FILTER (WHERE action IN ('share_pdf','share_image')) > 0
  ORDER BY shares DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_shared_products_by_period(text, int) TO authenticated;

-- 2a. Top productos más vistos de UN usuario puntual (para "Mi Actividad"
--     y para el panel "Tus Productos Más Vistos" del Historial).
CREATE OR REPLACE FUNCTION public.get_top_viewed_products_by_user_period(p_email text, p_period text DEFAULT 'all', p_limit int DEFAULT 10)
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
  WHERE user_email = p_email
    AND created_at >= public.period_start(p_period)
    AND (modelo IS NOT NULL OR sku IS NOT NULL)
  GROUP BY modelo, marca, sku
  HAVING COUNT(*) FILTER (WHERE action = 'view') > 0
  ORDER BY views DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_viewed_products_by_user_period(text, text, int) TO authenticated;

-- 2b. Top productos más COMPARTIDOS de un usuario puntual.
CREATE OR REPLACE FUNCTION public.get_top_shared_products_by_user_period(p_email text, p_period text DEFAULT 'all', p_limit int DEFAULT 10)
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
  WHERE user_email = p_email
    AND created_at >= public.period_start(p_period)
    AND (modelo IS NOT NULL OR sku IS NOT NULL)
  GROUP BY modelo, marca, sku
  HAVING COUNT(*) FILTER (WHERE action IN ('share_pdf','share_image')) > 0
  ORDER BY shares DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_shared_products_by_user_period(text, text, int) TO authenticated;

-- 2c. Top marcas de un usuario puntual (para "Mi Actividad" y el panel
--     "Tus Marcas" del Historial).
CREATE OR REPLACE FUNCTION public.get_top_brands_by_user_period(p_email text, p_period text DEFAULT 'all', p_limit int DEFAULT 10)
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
  WHERE user_email = p_email
    AND created_at >= public.period_start(p_period)
    AND marca IS NOT NULL
  GROUP BY marca
  ORDER BY (COUNT(*) FILTER (WHERE action = 'view') + COUNT(*) FILTER (WHERE action IN ('share_pdf','share_image'))) DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_brands_by_user_period(text, text, int) TO authenticated;

-- 3. Vistas por día de un usuario puntual (para el gráfico de "Mi
--    Actividad": inicio de período, pico, vistas de hoy). Un renglón por
--    día, no un evento por fila -- el cálculo de "pico"/"inicio" en el
--    cliente pasa a operar sobre unos pocos renglones (días), nunca sobre
--    miles de eventos crudos, sin importar cuánta actividad tenga el
--    usuario.
CREATE OR REPLACE FUNCTION public.get_user_daily_views_by_period(p_email text, p_period text DEFAULT 'all')
RETURNS TABLE(day date, views bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    created_at::date AS day,
    COUNT(*) AS views
  FROM public.producto_analytics
  WHERE user_email = p_email
    AND action = 'view'
    AND created_at >= public.period_start(p_period)
  GROUP BY created_at::date
  ORDER BY day ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_daily_views_by_period(text, text) TO authenticated;

-- 4. Reporte por lote de N usuarios en UNA sola llamada -- reemplaza al
--    PDF de "Reporte por Usuario" trayendo eventos crudos y paginando del
--    lado del cliente (ver pdfGridReport.ts). Postgres agrega los top 5
--    productos, top 5 marcas y hora pico de cada usuario en un solo
--    round-trip, sin transferir un solo evento crudo a la app.
CREATE OR REPLACE FUNCTION public.get_users_report_batch(p_emails text[], p_period text DEFAULT 'all')
RETURNS TABLE(
  user_email text,
  views bigint,
  shares_pdf bigint,
  shares_img bigint,
  top_products jsonb,
  top_brands jsonb,
  peak_hour text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH base AS (
    SELECT *
    FROM public.producto_analytics
    WHERE user_email = ANY(p_emails)
      AND created_at >= public.period_start(p_period)
  ),
  prod_counts AS (
    SELECT
      user_email,
      COALESCE(sku, modelo) AS prod_key,
      MAX(marca) AS marca,
      COALESCE(sku, modelo) AS sku,
      COUNT(*) AS cnt
    FROM base
    WHERE COALESCE(sku, modelo) IS NOT NULL
    GROUP BY user_email, COALESCE(sku, modelo)
  ),
  prod_ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_email ORDER BY cnt DESC) AS rn
    FROM prod_counts
  ),
  top_products_agg AS (
    SELECT user_email, jsonb_agg(jsonb_build_object('sku', sku, 'marca', marca, 'count', cnt) ORDER BY cnt DESC) AS top_products
    FROM prod_ranked
    WHERE rn <= 5
    GROUP BY user_email
  ),
  brand_counts AS (
    SELECT user_email, marca, COUNT(*) AS cnt
    FROM base
    WHERE marca IS NOT NULL
    GROUP BY user_email, marca
  ),
  brand_ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_email ORDER BY cnt DESC) AS rn
    FROM brand_counts
  ),
  top_brands_agg AS (
    SELECT user_email, jsonb_agg(jsonb_build_object('marca', marca, 'count', cnt) ORDER BY cnt DESC) AS top_brands
    FROM brand_ranked
    WHERE rn <= 5
    GROUP BY user_email
  ),
  hourly AS (
    SELECT user_email, EXTRACT(HOUR FROM created_at)::int AS hr, COUNT(*) AS cnt
    FROM base
    GROUP BY user_email, EXTRACT(HOUR FROM created_at)
  ),
  peak AS (
    SELECT DISTINCT ON (user_email) user_email, hr
    FROM hourly
    ORDER BY user_email, cnt DESC, hr ASC
  ),
  kpis AS (
    SELECT
      user_email,
      COUNT(*) FILTER (WHERE action = 'view') AS views,
      COUNT(*) FILTER (WHERE action = 'share_pdf') AS shares_pdf,
      COUNT(*) FILTER (WHERE action = 'share_image') AS shares_img
    FROM base
    GROUP BY user_email
  )
  SELECT
    e AS user_email,
    COALESCE(k.views, 0) AS views,
    COALESCE(k.shares_pdf, 0) AS shares_pdf,
    COALESCE(k.shares_img, 0) AS shares_img,
    COALESCE(tp.top_products, '[]'::jsonb) AS top_products,
    COALESCE(tb.top_brands, '[]'::jsonb) AS top_brands,
    CASE
      WHEN p.hr IS NULL THEN 'Sin actividad'
      ELSE lpad(p.hr::text, 2, '0') || ':00 - ' || lpad(((p.hr + 1) % 24)::text, 2, '0') || ':00'
    END AS peak_hour
  FROM unnest(p_emails) AS e
  LEFT JOIN kpis k ON k.user_email = e
  LEFT JOIN top_products_agg tp ON tp.user_email = e
  LEFT JOIN top_brands_agg tb ON tb.user_email = e
  LEFT JOIN peak p ON p.user_email = e;
$$;
GRANT EXECUTE ON FUNCTION public.get_users_report_batch(text[], text) TO authenticated;
