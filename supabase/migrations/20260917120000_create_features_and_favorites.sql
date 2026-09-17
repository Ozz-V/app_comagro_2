-- ==============================================================================
-- Migración: Feature Flags & User Favorites
-- ==============================================================================

-- 1. Tabla de Feature Flags (Control Remoto)
CREATE TABLE IF NOT EXISTS public.app_features (
    feature_key TEXT PRIMARY KEY,
    is_enabled BOOLEAN DEFAULT true NOT NULL,
    label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS para app_features (Solo admin escribe, todos leen)
ALTER TABLE public.app_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read features" ON public.app_features
    FOR SELECT USING (true);

CREATE POLICY "Admins can update features" ON public.app_features
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can insert features" ON public.app_features
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete features" ON public.app_features
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Seed de features iniciales
INSERT INTO public.app_features (feature_key, is_enabled, label) VALUES
    ('favoritos', true, 'Favoritos (Estrella)'),
    ('historial_user', true, 'Historial (Usuario Normal)'),
    ('estadisticas_admin', true, 'Métricas Completas (Admin)'),
    ('producto_estrella', true, 'Producto Estrella Global')
ON CONFLICT (feature_key) DO NOTHING;

-- 2. Tabla de User Favorites
CREATE TABLE IF NOT EXISTS public.user_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    sku TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, sku) -- Evita duplicados del mismo producto para el mismo usuario
);

-- RLS para user_favorites (Cada usuario ve y maneja solo los suyos)
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own favorites" ON public.user_favorites
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites" ON public.user_favorites
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites" ON public.user_favorites
    FOR DELETE USING (auth.uid() = user_id);

-- Crear índice para búsquedas rápidas por usuario y sku
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON public.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_sku ON public.user_favorites(sku);
