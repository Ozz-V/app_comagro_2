const PLYTIX_URL = 'https://pim.plytix.com/channels/69b2c94b558d8c2b27901090/feed'

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

  try {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: CORS_HEADERS,
      })
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')

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

    if (!user.email?.toLowerCase().endsWith('@comagro.com.py')) {
      return new Response(JSON.stringify({ error: 'Acceso denegado' }), {
        status: 403,
        headers: CORS_HEADERS,
      })
    }

    const url = new URL(req.url)
    const skuQuery = url.searchParams.get('sku')
    const sinceHeader = req.headers.get('X-Since')
    const since = sinceHeader ? new Date(parseInt(sinceHeader)) : null

    let finalData: any[] = []

    // 1. Intentar leer de la caché de Supabase (Fase 2.2)
    let query = supabaseClient.from('plytix_cache').select('data, updated_at');
    if (skuQuery) {
      query = query.eq('sku', skuQuery);
    }
    if (since) {
      query = query.gt('updated_at', since.toISOString());
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
      finalData = filtered;
    }

    if (!finalData.length && !skuQuery && !since) {
      return new Response(JSON.stringify({
        error: 'No se pudieron interpretar registros válidos',
      }), {
        status: 502,
        headers: CORS_HEADERS,
      })
    }

    return new Response(JSON.stringify(finalData), {
      status: 200,
      headers: CORS_HEADERS,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: CORS_HEADERS,
    })
  }
})