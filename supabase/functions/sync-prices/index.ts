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
           // EXTREMADAMENTE IMPORTANTE: Si no hay match EXACTO, no hacemos fallback al primer elemento.
           // Magento puede devolver productos similares (ej. repuestos GAEH50/122/SP al buscar GAEH50).
           // Tomar el primer resultado a ciegas causa que se asigne el precio de un repuesto a la motobomba.
           priceString = null;
        }
        
        if (priceString) {
          precioFinal = parseFloat(priceString);
        }

        // Si encontró precio, actualiza el precio Y la huella
        if (precioFinal !== null) {
          // 1. Actualiza el precio en AI data
          await supabaseClient.from('productos_ai_data').update({ 
            precio_web: precioFinal,
            precio_actualizado_en: now
          }).eq('sku', prod.sku);
          
          // 2. BUMP MAGICO: Le avisa a la tabla de Plytix que este producto se "actualizó".
          // Así, cuando la App pregunte "¿qué cambió hoy?" (Sincronización Inteligente),
          // el servidor le enviará este producto y la App descargará el nuevo precio al instante.
          await supabaseClient.from('plytix_queue').update({
            updated_at: now
          }).eq('sku', prod.sku);

          actualizados++;
          detalles.push({ sku: prod.sku, precio: precioFinal });
        } else {
          // Si NO encontró precio (o ya no existe en la web), lo borramos de la BD
          // y actualizamos la huella para que no se tranque la cola.
          await supabaseClient.from('productos_ai_data').update({ 
            precio_web: null,
            precio_actualizado_en: now
          }).eq('sku', prod.sku);

          // También avisamos a la app que este producto cambió (para que borre el precio en los teléfonos)
          await supabaseClient.from('plytix_queue').update({
            updated_at: now
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
