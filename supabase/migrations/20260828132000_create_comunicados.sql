-- Crear el menú desplegable (ENUM) en la base de datos
CREATE TYPE public.tipo_comunicado AS ENUM (
    '¡Nuevas actualizaciones!',
    'Aviso Importante',
    'Problemas Conocidos / Mejoras',
    'Saludos / Festividades (Otros)'
);

-- Crear la tabla con el desplegable y soporte para imágenes
CREATE TABLE public.app_comunicados (
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

CREATE POLICY "Lectura publica de comunicados activos"
    ON public.app_comunicados
    FOR SELECT
    USING (is_active = true);
