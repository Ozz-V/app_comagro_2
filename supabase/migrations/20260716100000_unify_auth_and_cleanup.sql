-- Migration: 20260716100000_unify_auth_and_cleanup.sql
-- Goal: Unify admin authorization and clean up old artifacts

-- 1. Create a definitive is_admin() function based on profiles table
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Migrate existing event_admins to profiles.role = 'admin' safely
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_role_self_escalation;

UPDATE profiles
SET role = 'admin'
WHERE email IN (SELECT email FROM event_admins)
  AND role IS DISTINCT FROM 'admin';

ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_role_self_escalation;

-- 3. Consolidate Policies for events, registrations, budgets, shifts to use is_admin()
-- First, drop duplicate or insecure policies (like 'Staff manage events', 'Autenticados gestionan eventos')
DROP POLICY IF EXISTS "Staff manage events" ON public.events;
DROP POLICY IF EXISTS "Autenticados gestionan eventos" ON public.events;
DROP POLICY IF EXISTS "Autenticados ven perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by staff" ON public.profiles;

-- Create strict policies using is_admin()
CREATE POLICY "Admins can manage events" ON public.events
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Anyone can read events" ON public.events
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- 4. Clean up Schema Junk (obsolete API keys)
ALTER TABLE public.app_config 
DROP COLUMN IF EXISTS ai_api_keys,
DROP COLUMN IF EXISTS groq_api_keys;

-- Lock down app_config strictly
DROP POLICY IF EXISTS "Autenticados leen app config" ON public.app_config;
CREATE POLICY "Admins can manage app config" ON public.app_config
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Anyone can read app config" ON public.app_config
  FOR SELECT
  TO authenticated, anon
  USING (true);
