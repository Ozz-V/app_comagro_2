-- Crear el menú desplegable (ENUM) en la base de datos
-- (protegido con IF NOT EXISTS: esta tabla ya existe en producción,
-- así que esto debe poder re-correr sin romper nada)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_comunicado') THEN
        CREATE TYPE public.tipo_comunicado AS ENUM (
            '¡Nuevas actualizaciones!',
            'Aviso Importante',
            'Problemas Conocidos / Mejoras',
            'Saludos / Festividades (Otros)'
        );
    END IF;
END $$;

-- Crear la tabla con el desplegable y soporte para imágenes
CREATE TABLE IF NOT EXISTS public.app_comunicados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo public.tipo_comunicado NOT NULL DEFAULT '¡Nuevas actualizaciones!',
    titulo TEXT NOT NULL,
    contenido TEXT NOT NULL,
    imagen_url TEXT, -- Opcional: Para poner el link del flyer de Navidad, etc.
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permisos para que la app lo lea sin problemas
ALTER TABLE public.app_comunicados ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'app_comunicados'
          AND policyname = 'Lectura publica de comunicados activos'
    ) THEN
        CREATE POLICY "Lectura publica de comunicados activos"
            ON public.app_comunicados
            FOR SELECT
            USING (is_active = true);
    END IF;
END $$;
