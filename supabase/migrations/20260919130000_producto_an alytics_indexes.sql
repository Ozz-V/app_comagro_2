-- ==============================================================================
-- Índices para producto_analytics.
--
-- Contexto: la tabla no tenía NINGÚN índice (ni siquiera una PRIMARY KEY).
-- Todas las funciones de reportes/métricas (get_global_kpis,
-- get_top_*_by_period, get_top_*_by_user_period, get_users_report_batch,
-- get_user_daily_views_by_period, get_most_active_user, etc.) hacen un
-- SEQUENTIAL SCAN completo de la tabla en cada llamada. Con pocos cientos
-- de filas no se nota; con decenas/cientos de miles de eventos (lo normal
-- con el uso diario de la app) cada reporte se pone progresivamente más
-- lento y consume más CPU -- un recurso limitado también en el plan free
-- de Supabase, no solo el ancho de banda.
--
-- Dos índices cubren el 100% de los patrones de consulta usados hoy:
--
-- 1) (user_email, created_at) -- para TODA consulta "de un usuario puntual
--    en un rango de fechas": Mi Actividad, los paneles de Historial
--    (TopProductsPanel, TopSharedPanel, TopBrandsPanel), y
--    get_users_report_batch (que filtra por user_email = ANY(...) +
--    created_at, Postgres puede usar este mismo índice con un bitmap scan
--    para varios usuarios a la vez).
--
-- 2) (created_at) -- para las consultas GLOBALES filtradas solo por fecha
--    (get_global_kpis, get_top_viewed/shared_products_by_period,
--    get_top_brands_by_period, get_top_users_by_period). Para el período
--    "all" no hay forma de evitar leer todas las filas (hace falta cada
--    una para el conteo total), pero para "Hoy"/"7d"/"30d" -- que es lo
--    que la mayoría de la gente mira la mayoría de las veces -- este
--    índice le permite a Postgres saltar directo al rango de fechas en
--    vez de revisar el historial completo.
--
-- Notas de seguridad para quien aplique esto:
-- * CREATE INDEX (sin CONCURRENTLY) toma un lock breve de escritura sobre
--   la tabla mientras se construye. Con el volumen de datos actual del
--   proyecto esto es cuestión de milisegundos/segundos y no debería
--   notarse; si en el futuro la tabla ya tiene millones de filas y se
--   quiere aplicar esto sin bloquear escrituras en producción, se puede
--   correr manualmente por fuera de una migración con
--   CREATE INDEX CONCURRENTLY (no se usa acá porque no puede ejecutarse
--   dentro de una transacción, y las migraciones suelen correr en una).
-- * No se borra ni modifica ningún dato existente -- estas dos sentencias
--   son 100% aditivas.
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_producto_analytics_user_created
  ON public.producto_analytics (user_email, created_at);

CREATE INDEX IF NOT EXISTS idx_producto_analytics_created
  ON public.producto_analytics (created_at);
