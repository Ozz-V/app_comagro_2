import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import * as postgres from "https://deno.land/x/postgres@v0.17.0/mod.ts";

serve(async (req) => {
  // Auth Shield: Solo administradores con service role key pueden ejecutar DDL
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader !== `Bearer ${supabaseServiceKey}`) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!databaseUrl) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const pool = new postgres.Pool(databaseUrl, 1);
  const connection = await pool.connect();

  try {
    await connection.queryObject(`
      CREATE TABLE IF NOT EXISTS ai_company_knowledge (
         id uuid primary key default gen_random_uuid(),
         rule text not null,
         created_at timestamptz default now(),
         embedding vector(768)
      );

      CREATE OR REPLACE FUNCTION buscar_conocimiento_ia (
         query_embedding vector(768),
         match_threshold float,
         match_count int
      ) RETURNS TABLE (
         id uuid,
         rule text,
         similarity float
      )
      LANGUAGE plpgsql
      AS $$
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
      $$;
    `);
    return new Response("Knowledge Base created successfully", { status: 200 });
  } catch (error) {
    console.error("setup-db error:", error.message);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } finally {
    connection.release();
  }
});
