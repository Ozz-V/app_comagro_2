-- ============================================================
-- Fix: Solo los correos presentes en event_admins pueden
-- administrar (crear/editar/borrar) eventos, turnos, presupuestos
-- e inscripciones. La lectura/inscripción pública (sin login)
-- para el link de inscripción y el link de sorteo NO SE TOCA.
-- ============================================================

-- 1. Helper: ¿el usuario autenticado actual es admin de eventos?
--    Se basa en el email del JWT contra la tabla event_admins.
CREATE OR REPLACE FUNCTION public.is_event_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_admins
    WHERE email = auth.jwt() ->> 'email'
  );
$$;

-- ============================================================
-- 2. event_admins: solo un admin existente puede agregar/quitar
--    admins. La lectura queda para admins únicamente (no hace
--    falta que nadie más vea esta lista).
-- ============================================================
DROP POLICY IF EXISTS "Autenticados pueden gestionar admins" ON public.event_admins;
DROP POLICY IF EXISTS "Solo lectura event_admins" ON public.event_admins;
DROP POLICY IF EXISTS "Only staff sees admins" ON public.event_admins;

CREATE POLICY "Solo admins gestionan admins" ON public.event_admins
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_event_admin())
  WITH CHECK (public.is_event_admin());

-- ============================================================
-- 3. event_shifts: lectura y escritura solo para admins.
--    (Si en algún momento la web necesita que CUALQUIER logueado
--    vea turnos, avisame y separamos SELECT de las demás).
-- ============================================================
DROP POLICY IF EXISTS "Autenticados leen turnos" ON public.event_shifts;
DROP POLICY IF EXISTS "Autenticados insertan turnos" ON public.event_shifts;
DROP POLICY IF EXISTS "Autenticados actualizan turnos" ON public.event_shifts;
DROP POLICY IF EXISTS "Autenticados borran turnos" ON public.event_shifts;

CREATE POLICY "Solo admins gestionan turnos" ON public.event_shifts
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_event_admin())
  WITH CHECK (public.is_event_admin());

-- ============================================================
-- 4. event_budget_items: idem. Había 2 policies duplicadas
--    ("Autenticados gestionan presupuestos" y "Allow authenticated
--    users") haciendo lo mismo; se reemplazan ambas por una sola.
-- ============================================================
DROP POLICY IF EXISTS "Autenticados gestionan presupuestos" ON public.event_budget_items;
DROP POLICY IF EXISTS "Allow authenticated users" ON public.event_budget_items;

CREATE POLICY "Solo admins gestionan presupuestos" ON public.event_budget_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_event_admin())
  WITH CHECK (public.is_event_admin());

-- ============================================================
-- 5. events: la LECTURA PÚBLICA se mantiene intacta (el sitio
--    necesita mostrar el evento sin login). Solo se restringe
--    quién puede CREAR/EDITAR/BORRAR eventos. Había 2 policies
--    de gestión duplicadas ("Staff manage events" y "Autenticados
--    gestionan eventos"); se reemplazan por una sola.
-- ============================================================
DROP POLICY IF EXISTS "Staff manage events" ON public.events;
DROP POLICY IF EXISTS "Autenticados gestionan eventos" ON public.events;
DROP POLICY IF EXISTS "Solo lectura events" ON public.events;
-- "Lectura publica eventos" (TO public, SELECT) NO se toca.

CREATE POLICY "Solo admins gestionan eventos" ON public.events
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_event_admin())
  WITH CHECK (public.is_event_admin());

-- ============================================================
-- 6. registrations: el INSERT y SELECT públicos (sin login) se
--    mantienen intactos, son el link de inscripción y de sorteo.
--    Solo se restringe UPDATE/DELETE (marcar asistencia, borrar
--    un inscripto, etc.) a los admins reales, en vez de "cualquier
--    autenticado". Había policies duplicadas; se consolidan.
-- ============================================================
DROP POLICY IF EXISTS "Staff can update registrations" ON public.registrations;
DROP POLICY IF EXISTS "Autenticados actualizan inscripciones" ON public.registrations;
DROP POLICY IF EXISTS "Staff can read registrations" ON public.registrations;
DROP POLICY IF EXISTS "Admin can delete registrations" ON public.registrations;
DROP POLICY IF EXISTS "Autenticados borran inscripciones" ON public.registrations;
-- "Lectura publica inscripciones" y "Insercion publica inscripciones"
-- (TO public) NO se tocan: son el link de inscripción/sorteo.

CREATE POLICY "Solo admins editan inscripciones" ON public.registrations
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.is_event_admin())
  WITH CHECK (public.is_event_admin());

CREATE POLICY "Solo admins borran inscripciones" ON public.registrations
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (public.is_event_admin());
