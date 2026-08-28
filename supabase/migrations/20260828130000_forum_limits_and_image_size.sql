-- ============================================================
-- MIGRACIÓN: Límites de servidor para foro + tamaño de imagen
-- ============================================================

-- 1. LÍMITE: Máximo 2 sugerencias (forum_topics) por usuario
--    Se implementa con una función CHECK que rechaza el INSERT
--    si el usuario ya tiene 2 o más topics registrados.
-- ============================================================

CREATE OR REPLACE FUNCTION check_forum_topic_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  topic_count integer;
BEGIN
  SELECT COUNT(*)
    INTO topic_count
    FROM forum_topics
   WHERE user_id = NEW.user_id;

  IF topic_count >= 2 THEN
    RAISE EXCEPTION 'Límite alcanzado: ya creaste 2 sugerencias. Elimina una para poder crear otra.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_topic_limit ON forum_topics;

CREATE TRIGGER trg_forum_topic_limit
  BEFORE INSERT ON forum_topics
  FOR EACH ROW
  EXECUTE FUNCTION check_forum_topic_limit();

-- ============================================================
-- 2. LÍMITE: Máximo 3 comentarios (forum_comments) por usuario
--    por topic. Se rechaza el INSERT si el usuario ya tiene
--    3 o más comentarios en ese topic_id.
-- ============================================================

CREATE OR REPLACE FUNCTION check_forum_comment_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  comment_count integer;
BEGIN
  SELECT COUNT(*)
    INTO comment_count
    FROM forum_comments
   WHERE user_id    = NEW.user_id
     AND topic_id   = NEW.topic_id;

  IF comment_count >= 3 THEN
    RAISE EXCEPTION 'Límite alcanzado: ya tienes 3 comentarios en esta sugerencia. Borra uno para continuar.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_comment_limit ON forum_comments;

CREATE TRIGGER trg_forum_comment_limit
  BEFORE INSERT ON forum_comments
  FOR EACH ROW
  EXECUTE FUNCTION check_forum_comment_limit();

-- ============================================================
-- 3. LÍMITE de tamaño de imagen en Storage (bucket forum_images)
--    Supabase Storage no expone un trigger SQL directo, pero
--    sí podemos limitar el tamaño máximo del objeto vía la
--    política de Storage ("max_file_size").
--    Aquí configuramos a 1 MB = 1048576 bytes.
--
--    NOTA: Esta política se aplica en el dashboard de Supabase
--    Storage → Bucket "forum_images" → Policies.
--    Esta migración documenta el valor acordado para registro.
-- ============================================================

-- Política RLS INSERT en Storage (forum_images): tamaño ≤ 1 MB
-- (Supabase aplica esto via el campo metadata.size en las políticas
--  de Storage. Si el bucket ya existe, actualizar en el dashboard.)

COMMENT ON TABLE forum_topics IS
  'Máximo 2 topics por usuario (enforced por trigger trg_forum_topic_limit)';

COMMENT ON TABLE forum_comments IS
  'Máximo 3 comentarios por usuario por topic (enforced por trigger trg_forum_comment_limit)';
