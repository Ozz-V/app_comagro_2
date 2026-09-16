import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // 1. Obtener todos los SKUs de nuestra tabla
    const { data: productos, error: dbError } = await supabaseClient
      .from('productos_ai_data')
      .select('sku');

    if (dbError) throw dbError;

    let actualizados = 0;

    // 2. Por cada producto, visitar la web y buscar el precio
    for (const prod of (productos || [])) {
      if (!prod.sku) continue;
      
      const url = "https://www.comagro.com.py/catalogsearch/result/?q=${prod.sku}";
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Comagro SyncBot 1.0)' }
        });
        
        const html = await res.text();
        
        // 3. Extraer el precio usando expresión regular
        const match = html.match(/data-price-amount="(\d+(\.\d+)?)"/);
        if (match && match[1]) {
          const precio = parseFloat(match[1]);
          
          // 4. Actualizar la base de datos
          await supabaseClient
            .from('productos_ai_data')
            .update({ precio_web: precio })
            .eq('sku', prod.sku);
            
          actualizados++;
        }
      } catch (err) {
        console.error("Error procesando SKU ${prod.sku}:", err);
      }
      
      // Pequeña pausa de 200ms para no saturar el servidor web de Adobe Commerce
      await new Promise(r => setTimeout(r, 200)); 
    }

    return new Response(JSON.stringify({ status: "success", procesados: actualizados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
