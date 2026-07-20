import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLYTIX_URL = Deno.env.get('PLYTIX_CHANNEL_URL') ?? 'https://pim.plytix.com/channels/69b2c94b558d8c2b27901090/feed'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.comagro.com.py',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-since',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: CORS_HEADERS,
    })
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: CORS_HEADERS,
      })
    }

    // Dynamic import removed in favor of static import at the top

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    )

    const { data: { user }, error } = await supabaseClient.auth.getUser()

    if (error || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: CORS_HEADERS,
      })
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin' && profile?.role !== 'staff') {
      return new Response(JSON.stringify({ error: 'Acceso denegado. Rol de admin o staff requerido.' }), {
        status: 403,
        headers: CORS_HEADERS,
      })
    }

    const url = new URL(req.url)
    const skuQuery = url.searchParams.get('sku')
    const sinceHeader = req.headers.get('X-Since')
    const since = sinceHeader ? new Date(parseInt(sinceHeader)) : null
    
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const limit = limitParam ? parseInt(limitParam) : null
    const offset = offsetParam ? parseInt(offsetParam) : null

    // deno-lint-ignore no-explicit-any
    let finalData: any[] = []

    // 1. Intentar leer de la caché de Supabase (Fase 2.2)
    let query = supabaseClient.from('plytix_cache').select('data, updated_at');
    
    // IMPORTANTE: Asegurar orden predecible para que la paginación no salte o repita registros
    query = query.order('sku', { ascending: true });

    if (skuQuery) {
      query = query.eq('sku', skuQuery);
    }
    if (since) {
      query = query.gt('updated_at', since.toISOString());
    }
    if (limit !== null && offset !== null) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data: dbData, error: dbError } = await query;

    if (!dbError && dbData && dbData.length > 0) {
      // Usar datos de caché
      finalData = dbData.map(row => {
        const prod = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        prod.updated_at = row.updated_at;
        return prod;
      });
    } else {
      // 2. Fallback: Consultar directo a Plytix si falla o la tabla no existe
      const res = await fetch(PLYTIX_URL)
      const text = await res.text()

      if (!res.ok) {
        return new Response(JSON.stringify({
          error: 'Error al consultar Plytix',
          status: res.status,
          preview: text.slice(0, 500),
        }), {
          status: 502,
          headers: CORS_HEADERS,
        })
      }

      // deno-lint-ignore no-explicit-any
      let parsedData: any[] = []
      try {
        const parsed = JSON.parse(text)
        parsedData = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        parsedData = text
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .flatMap(line => {
            try {
              return [JSON.parse(line)]
            } catch {
              return []
            }
          })
      }

      // Aplicar filtros en memoria para el fallback
      let filtered = parsedData;
      if (skuQuery) {
        filtered = filtered.filter(p => p.SKU === skuQuery || p.sku === skuQuery || p.modelo === skuQuery);
      }
      if (since) {
        filtered = filtered.filter(p => p.updated_at && new Date(p.updated_at) > since);
      }
      if (limit !== null && offset !== null) {
        filtered = filtered.slice(offset, offset + limit);
      }
      finalData = filtered;
    }

    // Si es una petición paginada vacía, está bien (significa que se acabó el bucle).
    // Solo tiramos error si no es paginada y no trae nada.
    if (!finalData.length && !skuQuery && !since && limit === null) {
      return new Response(JSON.stringify({
        error: 'No se pudieron interpretar registros válidos',
      }), {
        status: 502,
        headers: CORS_HEADERS,
      })
    }

    console.log(JSON.stringify({
      event: 'swift_task_complete',
      user_id: user.id,
      sku_query: skuQuery,
      since: sinceHeader,
      results_count: finalData.length,
      source: (!dbError && dbData && dbData.length > 0) ? 'cache' : 'plytix_fallback',
      duration_ms: Date.now() - startTime,
    }));

    return new Response(JSON.stringify(finalData), {
      status: 200,
      headers: CORS_HEADERS,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: 'swift_task_error', error: message, duration_ms: Date.now() - startTime }));

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: CORS_HEADERS,
    })
  }
})