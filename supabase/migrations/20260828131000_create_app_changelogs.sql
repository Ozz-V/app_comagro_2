CREATE TABLE public.app_comunicados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL DEFAULT 'update', -- Puede ser 'update' o 'aviso'
    version TEXT, -- Se deja en blanco si es un 'aviso'
    titulo TEXT NOT NULL,
    contenido TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permisos públicos para que la app lo lea sin problemas
ALTER TABLE public.app_comunicados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura publica de comunicados activos"
    ON public.app_comunicados
    FOR SELECT
    USING (is_active = true);
