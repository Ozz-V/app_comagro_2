-- ============================================================
-- Fix: la pagina publica "lista de inscriptos en tiempo real"
-- (showPublicLista, ruta #/lista/:id, sin login) necesita leer
-- event_shifts para agrupar inscriptos por turno y generar el
-- Excel por hoja. Hoy no tiene ninguna policy TO public, así que
-- RLS le devuelve vacío en silencio (sin error visible).
--
-- Esto NO afecta la escritura: crear/editar/borrar turnos sigue
-- restringido a admins por la policy "Solo admins gestionan
-- turnos" (is_event_admin()) creada en la migración anterior.
-- Esta policy solo agrega LECTURA pública, igual al patrón que
-- ya existe en la tabla "events" ("Lectura publica eventos").
--
-- event_shifts no tiene columnas sensibles (nombre de turno,
-- horario, capacidad máxima) — es seguro exponerlo en lectura,
-- igual que la fecha/hora del evento ya lo es.
-- ============================================================

CREATE POLICY "Lectura publica turnos" ON public.event_shifts
  AS PERMISSIVE FOR SELECT
  TO public
  USING (true);
