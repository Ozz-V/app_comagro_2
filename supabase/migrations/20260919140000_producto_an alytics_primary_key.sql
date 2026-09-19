-- ==============================================================================
-- producto_analytics no tenía PRIMARY KEY. Se verificó antes de aplicar esto
-- que la columna "id" no tiene duplicados:
--
--   SELECT COUNT(*) - COUNT(DISTINCT id) AS duplicados
--   FROM public.producto_analytics;
--   -- resultado: 0
--
-- Por qué importa tener PK aunque no cambie las consultas de reportes:
-- * Es la unicidad + el índice más básico que Postgres espera de una tabla;
--   sin ella, funciones como la réplica lógica de Supabase (Realtime) no
--   pueden identificar filas individuales de esta tabla.
-- * Sirve como red de seguridad: si alguna vez un proceso de sync duplica
--   una fila por error, esto lo evita en el momento del INSERT, no lo
--   descubre alguien mirando un reporte raro meses después.
-- * No reemplaza los índices de la migración anterior (esos están pensados
--   para los patrones de consulta por usuario/fecha); esto es higiene de
--   base de datos aparte.
--
-- 100% aditivo: no borra ni modifica ninguna fila existente.
-- ==============================================================================

ALTER TABLE public.producto_analytics
  ADD CONSTRAINT producto_analytics_pkey PRIMARY KEY (id);
