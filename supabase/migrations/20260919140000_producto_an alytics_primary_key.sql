-- ==============================================================================
-- FIX 2026-09-19: el intento original de esta migración asumía (a partir del
-- schema snapshot del repo) que producto_analytics no tenía PRIMARY KEY. Al
-- correrla contra la base real salió:
--
--   ERROR: multiple primary keys for table "producto_analytics" are not
--   allowed (SQLSTATE 42P16)
--
-- Es decir, la tabla YA TENÍA una PK -- simplemente no estaba reflejada en
-- el schema snapshot versionado en el repo (que ya sabíamos desactualizado,
-- de ahí el "no hay historial" de este proyecto). No hacía falta agregar
-- nada.
--
-- Se deja esta migración como no-op defensivo (DO $$ ... $$ que primero
-- pregunta si ya existe una PK antes de intentar crear una) para que:
--   1) Corra sin error contra la base real tal como está hoy.
--   2) Si en algún escenario futuro (otro entorno, un rollback, etc.) la
--      tabla de verdad no tuviera PK, la cree -- sin tener que adivinar de
--      nuevo.
-- 100% aditivo/idempotente: nunca borra ni modifica una PK existente.
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.producto_analytics'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.producto_analytics
      ADD CONSTRAINT producto_analytics_pkey PRIMARY KEY (id);
  END IF;
END $$;
