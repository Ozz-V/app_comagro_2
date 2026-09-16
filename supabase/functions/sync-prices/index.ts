import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const urlParam = new URL(req.url);
    const limitQuery = urlParam.searchParams.get('limit');
    const limit = limitQuery ? parseInt(limitQuery) : 0;

    let dbQuery = supabaseClient.from('productos_ai_data').select('sku');
    if (limit > 0) dbQuery = dbQuery.limit(limit);

    const { data: productos, error: dbError } = await dbQuery;
    if (dbError) throw dbError;

    let actualizados = 0;
    const detalles = [];

    for (const prod of (productos || [])) {
      if (!prod.sku) continue;
      
      const url = `https://www.comagro.com.py/catalogsearch/result/?q=${prod.sku}`;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const firstProduct = $('.products.list.items .product-item').first();
        const priceString = firstProduct.find('[data-price-amount]').first().attr('data-price-amount');
        
        if (priceString) {
          const precio = parseFloat(priceString);
          
          await supabaseClient
            .from('productos_ai_data')
            .update({ precio_web: precio })
            .eq('sku', prod.sku);
            
          actualizados++;
          detalles.push({ sku: prod.sku, precio });
        } else {
          const fallbackPrice = $('.product-info-price').first().find('[data-price-amount]').first().attr('data-price-amount');
          if (fallbackPrice) {
            const precioFallback = parseFloat(fallbackPrice);
            await supabaseClient
              .from('productos_ai_data')
              .update({ precio_web: precioFallback })
              .eq('sku', prod.sku);
              
            actualizados++;
            detalles.push({ sku: prod.sku, precio: precioFallback });
          }
        }
      } catch (err) {
        console.error(`Error procesando SKU ${prod.sku}:`, err);
      }
      
      await new Promise(r => setTimeout(r, 600)); 
    }

    return new Response(JSON.stringify({ status: "success", procesados: actualizados, detalles }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
