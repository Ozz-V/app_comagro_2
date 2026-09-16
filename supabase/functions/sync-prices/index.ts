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
    const targetPrice = urlParam.searchParams.get('target_price');
    const limit = limitQuery ? parseInt(limitQuery) : 50;
    
    // Calcular hace 24 horas para la cola inteligente
    const hace24Horas = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let dbQuery;
    if (targetPrice) {
      dbQuery = supabaseClient.from('productos_ai_data').select('sku').eq('precio_web', parseFloat(targetPrice)).limit(limit);
    } else {
      // COLA INTELIGENTE: Traer solo los que nunca se han actualizado (null) o son más viejos que 24h
      // Y ordenarlos para atender primero a los más urgentes.
      dbQuery = supabaseClient
        .from('productos_ai_data')
        .select('sku')
        .or(`precio_actualizado_en.is.null,precio_actualizado_en.lte.${hace24Horas}`)
        .order('precio_actualizado_en', { ascending: true, nullsFirst: true })
        .limit(limit);
    }

    const { data: productos, error: dbError } = await dbQuery;
    if (dbError) throw dbError;

    let actualizados = 0;
    const detalles = [];

    for (const prod of (productos || [])) {
      if (!prod.sku) continue;
      
      const now = new Date().toISOString();
      let precioFinal = null;
      
      const url = `https://www.comagro.com.py/catalogsearch/result/?q=${prod.sku}`;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const exactForm = $(`form[data-product-sku="${prod.sku}"]`);
        let priceString;
        
        if (exactForm.length > 0) {
           priceString = exactForm.closest('.product-item').find('[data-price-amount]').first().attr('data-price-amount');
        } else {
           priceString = $('.products.list.items .product-item').first().find('[data-price-amount]').first().attr('data-price-amount');
        }
        
        if (priceString) {
          precioFinal = parseFloat(priceString);
        } else {
          const fallbackPrice = $('.product-info-price').first().find('[data-price-amount]').first().attr('data-price-amount');
          if (fallbackPrice) precioFinal = parseFloat(fallbackPrice);
        }

        // Si encontró precio, actualiza el precio Y la huella
        if (precioFinal !== null) {
          await supabaseClient.from('productos_ai_data').update({ 
            precio_web: precioFinal,
            precio_actualizado_en: now
          }).eq('sku', prod.sku);
          actualizados++;
          detalles.push({ sku: prod.sku, precio: precioFinal });
        } else {
          // Si NO encontró precio, SOLO actualiza la huella para que no se tranque la cola
          await supabaseClient.from('productos_ai_data').update({ 
            precio_actualizado_en: now
          }).eq('sku', prod.sku);
        }

      } catch (err) {
        console.error(`Error procesando SKU ${prod.sku}:`, err);
        // Fallo de red severo: marcamos la huella igual para sacarlo de la cola actual
        await supabaseClient.from('productos_ai_data').update({ precio_actualizado_en: now }).eq('sku', prod.sku);
      }
      
      await new Promise(r => setTimeout(r, 600)); 
    }

    return new Response(JSON.stringify({ status: "success", procesados: actualizados, count: productos?.length, detalles }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
