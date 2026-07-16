-- Fix: producto_analytics SELECT should only show the user's own rows
-- Previously any authenticated user could read all rows from all users
DROP POLICY IF EXISTS "select_analytics" ON public.producto_analytics;

CREATE POLICY "Users read own analytics" ON public.producto_analytics
  FOR SELECT
  TO authenticated
  USING (user_email = (auth.jwt() ->> 'email'));

-- Admins can read all analytics for dashboard purposes
CREATE POLICY "Admins read all analytics" ON public.producto_analytics
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
