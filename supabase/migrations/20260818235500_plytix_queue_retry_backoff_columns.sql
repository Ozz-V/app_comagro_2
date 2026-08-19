-- Agrega las columnas necesarias para que sync-plytix pueda:
-- 1. Detectar cambios REALES de contenido vs. deltas repetidos de Plytix (content_hash)
-- 2. Reintentar automáticamente ante cualquier error, sin marcar 'error' permanente (retry_count, last_error)
-- 3. Aplicar backoff exponencial: más intentos fallidos -> más espaciado el próximo intento,
--    para no competir por lugar en el batch contra productos sanos (next_attempt_at)
--
-- Usamos "if not exists" porque estas columnas ya pueden existir en el proyecto (se
-- agregaron manualmente vía SQL Editor durante el desarrollo, antes de que este código
-- quedara commiteado en el repo). Esta migración deja el estado documentado y es segura
-- de correr aunque las columnas ya estén creadas.

alter table plytix_queue add column if not exists content_hash text;
alter table plytix_queue add column if not exists retry_count integer default 0;
alter table plytix_queue add column if not exists last_error text;
alter table plytix_queue add column if not exists next_attempt_at timestamptz default now();

-- Cualquier fila que haya quedado en 'error' por versiones anteriores del código (que sí
-- marcaban error permanente) vuelve al circuito normal, disponible de inmediato.
update plytix_queue
set status = 'pending',
    retry_count = 0,
    next_attempt_at = now(),
    last_error = null,
    updated_at = now()
where status = 'error';
