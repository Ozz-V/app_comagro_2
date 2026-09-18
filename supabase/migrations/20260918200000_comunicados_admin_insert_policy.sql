-- =============================================================================
-- Politica INSERT para app_comunicados
-- Solo usuarios con role = 'admin' en la tabla profiles pueden crear
-- comunicados. La lectura publica ya existe (migration 20260828132000).
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'app_comunicados'
      AND policyname = 'Solo admins insertan comunicados'
  ) THEN
    CREATE POLICY "Solo admins insertan comunicados"
      ON public.app_comunicados
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id   = auth.uid()
            AND role = 'admin'
        )
      );
  END IF;
END $$;

-- Politica UPDATE/DELETE para que admins puedan editar o borrar comunicados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'app_comunicados'
      AND policyname = 'Solo admins modifican comunicados'
  ) THEN
    CREATE POLICY "Solo admins modifican comunicados"
      ON public.app_comunicados
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id   = auth.uid()
            AND role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id   = auth.uid()
            AND role = 'admin'
        )
      );
  END IF;
END $$;