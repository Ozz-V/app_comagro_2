-- Migration: Formalize the super_users table that was created manually in production
-- This table contains users who authenticate with a fixed password instead of OTP.
-- Access is restricted: only admins can manage entries.

CREATE TABLE IF NOT EXISTS public.super_users (
  email text NOT NULL PRIMARY KEY
);

ALTER TABLE public.super_users ENABLE ROW LEVEL SECURITY;

-- Only admins can read, insert, update, or delete super_users
DROP POLICY IF EXISTS "Only admins manage super_users" ON public.super_users;
CREATE POLICY "Only admins manage super_users" ON public.super_users
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
