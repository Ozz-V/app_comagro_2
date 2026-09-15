-- Migration: eliminar super_users (mecanismo de login legado, sin uso)
--
-- Contexto (auditoría 2026-09-14/15): super_users era una tabla creada
-- manualmente en producción para un login alternativo por contraseña
-- fija, en paralelo al login normal con Supabase Auth. Se formalizó en
-- 20260716210000_create_super_users_table.sql, pero ningún código de
-- la app (src/) la referencia ni la usa. Se confirma con el equipo que
-- no está en uso y se elimina.

DROP POLICY IF EXISTS "Only admins manage super_users" ON public.super_users;
DROP TABLE IF EXISTS public.super_users;
