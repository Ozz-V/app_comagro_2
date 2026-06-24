import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
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
            
            const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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
        } catch(e) {}
    }

    return new Response(JSON.stringify({ done: false, processed, nextPage: page + 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
