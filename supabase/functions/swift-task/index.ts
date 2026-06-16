const PLYTIX_URL = 'https://pim.plytix.com/channels/69b2c94b558d8c2b27901090/feed'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.comagro.com.py',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
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

    let data: unknown[] = []

    try {
      const parsed = JSON.parse(text)

      if (Array.isArray(parsed)) {
        data = parsed
      } else {
        data = [parsed]
      }
    } catch {
      data = text
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

    if (!data.length) {
      return new Response(JSON.stringify({
        error: 'No se pudieron interpretar registros válidos de Plytix',
        preview: text.slice(0, 800),
      }), {
        status: 502,
        headers: CORS_HEADERS,
      })
    }

    return new Response(JSON.stringify(data), {
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