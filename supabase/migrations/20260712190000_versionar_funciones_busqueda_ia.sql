-- Versiona las funciones de búsqueda semántica del chat con IA, que hasta
-- ahora existían solo "en vivo" en Supabase y no estaban en el repo.
-- Definiciones copiadas tal cual de producción (vía
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN (...))
-- el 2026-07-12 — no cambia ningún comportamiento, solo las deja
-- versionadas para poder recrearlas si hiciera falta (staging, disaster
-- recovery, etc.). Cualquier cambio futuro a estas funciones debería
-- hacerse editando esta migración, no directo en el dashboard.

CREATE OR REPLACE FUNCTION public.buscar_conocimiento_ia(query_embedding vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id uuid, rule text, similarity double precision)
 LANGUAGE plpgsql
AS $function$
      BEGIN
         RETURN QUERY
         SELECT
            ai_company_knowledge.id,
            ai_company_knowledge.rule,
            1 - (ai_company_knowledge.embedding <=> query_embedding) AS similarity
         FROM ai_company_knowledge
         WHERE 1 - (ai_company_knowledge.embedding <=> query_embedding) > match_threshold
         ORDER BY ai_company_knowledge.embedding <=> query_embedding
         LIMIT match_count;
      END;
      $function$;

CREATE OR REPLACE FUNCTION public.buscar_productos_ia(query_embedding vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(sku text, sales_pitch text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    productos_ai_data.sku,
    productos_ai_data.sales_pitch,
    1 - (productos_ai_data.embedding <=> query_embedding) AS similarity
  FROM productos_ai_data
  WHERE 1 - (productos_ai_data.embedding <=> query_embedding) > match_threshold
  ORDER BY productos_ai_data.embedding <=> query_embedding
  LIMIT match_count;
$function$;
