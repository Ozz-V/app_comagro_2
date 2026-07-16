-- 1. Create a definitive is_admin function based on profiles.role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Migrate existing event_admins to have the admin role in profiles
UPDATE public.profiles
SET role = 'admin'
WHERE email IN (SELECT email FROM public.event_admins);

-- 3. Clean up app_config (Hallazgo #5)
ALTER TABLE public.app_config DROP COLUMN IF EXISTS ai_api_keys;
ALTER TABLE public.app_config DROP COLUMN IF EXISTS groq_api_keys;

-- 4. Fix duplicate and overly permissive policies

-- Profiles: consolidate read policies
DROP POLICY IF EXISTS "Autenticados ven perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by staff" ON public.profiles;
CREATE POLICY "Autenticados ven perfiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Events: restrict management to admins (was using (true) for all authenticated)
DROP POLICY IF EXISTS "Staff manage events" ON public.events;
DROP POLICY IF EXISTS "Autenticados gestionan eventos" ON public.events;
CREATE POLICY "Admins gestionan eventos" ON public.events
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Version APK: restrict management to admins
DROP POLICY IF EXISTS "Admin manage versions" ON public.version_apk;
DROP POLICY IF EXISTS "Autenticados gestionan version" ON public.version_apk;
CREATE POLICY "Admins gestionan version" ON public.version_apk
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Registrations: restrict update/delete to admins
DROP POLICY IF EXISTS "Staff can update registrations" ON public.registrations;
DROP POLICY IF EXISTS "Autenticados actualizan inscripciones" ON public.registrations;
CREATE POLICY "Admins actualizan inscripciones" ON public.registrations
  FOR UPDATE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can delete registrations" ON public.registrations;
DROP POLICY IF EXISTS "Autenticados borran inscripciones" ON public.registrations;
CREATE POLICY "Admins borran inscripciones" ON public.registrations
  FOR DELETE TO authenticated USING (public.is_admin());

-- Event shifts and budgets: restrict management to admins
DROP POLICY IF EXISTS "Autenticados insertan turnos" ON public.event_shifts;
DROP POLICY IF EXISTS "Autenticados actualizan turnos" ON public.event_shifts;
DROP POLICY IF EXISTS "Autenticados borran turnos" ON public.event_shifts;
CREATE POLICY "Admins gestionan turnos" ON public.event_shifts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Autenticados gestionan presupuestos" ON public.event_budget_items;
DROP POLICY IF EXISTS "Allow authenticated users" ON public.event_budget_items;
CREATE POLICY "Admins gestionan presupuestos" ON public.event_budget_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
