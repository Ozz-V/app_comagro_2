-- Script de Auditoría de Row Level Security (RLS)
-- Copia y pega esto en el SQL Editor de Supabase y ejecútalo.

-- 1. Listar todas las tablas públicas que NO tienen RLS activado
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;

-- NOTA PARA EL ADMINISTRADOR:
-- Si este script devuelve algún nombre de tabla, significa que CUALQUIER PERSONA con la 'anon key'
-- puede leer, modificar o eliminar todos los registros de esa tabla.
-- Para activar RLS en una tabla, ejecuta:
-- ALTER TABLE tu_tabla ENABLE ROW LEVEL SECURITY;
-- Y luego crea políticas (Policies) para definir quién puede leer/escribir.
