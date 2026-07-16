import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    // Auth check first — before reading any sensitive env vars or creating clients
    const authHeader = req.headers.get('Authorization') ?? '';
    const updateSecret = Deno.env.get('UPDATE_VECTORS_SECRET') ?? '';
    if (!updateSecret || authHeader !== `Bearer ${updateSecret}`) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';

    const supaAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const page = body.page || 0;
    const limit = body.limit || 50;

    const { data: products, error: dbError } = await supaAdmin.from('productos_ai_data').select('sku, sales_pitch').range(page * limit, (page + 1) * limit - 1);
    
    if (dbError) throw dbError;
    if (!products || products.length === 0) {
       return new Response(JSON.stringify({ done: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    let processed = 0;
    for (const p of products) {
        try {
            const cleanSalesPitch = (p.sales_pitch || '').replace(/\*\*/g, '');
            
            const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
              body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text: cleanSalesPitch }] },
                outputDimensionality: 768,
                taskType: "RETRIEVAL_DOCUMENT"
              })
            });
            if (embedRes.ok) {
                const embedData = await embedRes.json();
                const vector = embedData.embedding.values;
                await supaAdmin.from('productos_ai_data').update({ embedding: vector, sales_pitch: cleanSalesPitch }).eq('sku', p.sku);
                processed++;
            }
            // Pequeño throttle para evitar limites de la API gratuita
            await new Promise(r => setTimeout(r, 200));
        } catch (err: unknown) {
          console.error(`[update-vectors] Error procesando SKU ${p.sku}:`, (err as Error).message);
        }
    }

    return new Response(JSON.stringify({ done: false, processed, nextPage: page + 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
