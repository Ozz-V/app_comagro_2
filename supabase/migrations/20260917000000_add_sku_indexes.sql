-- ==============================================================================
-- Migración: Optimización de Performance (Índices SKU)
-- ==============================================================================
-- Creado en respuesta a auditoría técnica. Previene sequential scans costosos.

-- Índice B-Tree estándar para productos_ai_data
CREATE INDEX IF NOT EXISTS idx_productos_ai_data_sku 
ON public.productos_ai_data (sku);

-- Índice B-Tree estándar para plytix_queue
CREATE INDEX IF NOT EXISTS idx_plytix_queue_sku 
ON public.plytix_queue (sku);
