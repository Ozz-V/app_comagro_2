import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLYTIX_URL = 'https://pim.plytix.com/channels/69b2c94b558d8c2b27901090/feed';

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';

    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader !== `Bearer ${supabaseServiceKey}`) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    if (!supabaseUrl || !supabaseServiceKey || !geminiKey) {
      throw new Error('Faltan variables de entorno (Supabase o Gemini)');
    }

    const supaAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Obtener todos los productos de Plytix
    const res = await fetch(PLYTIX_URL);
    if (!res.ok) throw new Error('Error al obtener feed de Plytix');
    
    const text = await res.text();
    let plytixData: any[] = [];
    
    try {
      const parsed = JSON.parse(text);
      plytixData = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      plytixData = text.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(l => {
          try { return JSON.parse(l); } catch { return null; }
        })
        .filter(Boolean);
    }

    if (!plytixData.length) {
      return new Response(JSON.stringify({ error: 'Feed vacío o inválido' }), { status: 400 });
    }

    // 2. Obtener todos los SKUs que YA existen en la base de datos (con paginación para más de 1000)
    let dbProducts = [];
    let page = 0;
    while(true) {
        const { data, error: dbError } = await supaAdmin.from('productos_ai_data').select('sku').range(page*1000, (page+1)*1000 - 1);
        if (dbError) throw dbError;
        if (!data || data.length === 0) break;
        dbProducts.push(...data);
        if (data.length < 1000) break;
        page++;
    }

    const existingSkus = new Set(dbProducts.map(p => String(p.sku).toUpperCase().trim()));

    // 3. Filtrar los que faltan
    const missingProducts = plytixData.filter(p => {
       if (!p.SKU) return false;
       return !existingSkus.has(String(p.SKU).toUpperCase().trim());
    });

    if (missingProducts.length === 0) {
       return new Response(JSON.stringify({ message: 'Todo está sincronizado. No hay productos nuevos.', processed: 0 }), { status: 200 });
    }

    // 4. Tomar un lote (batch) de máximo 10 productos para evitar Timeouts
    const batch = missingProducts.slice(0, 10);
    const processedSkus = [];
    let errors = [];

    // 5. Procesar cada producto del lote
    for (const p of batch) {
       const sku = String(p.SKU).trim();
       try {
         // a) Generar el Sales Pitch con IA
         const productContext = JSON.stringify(p, null, 2);
         const prompt = `Eres un redactor experto en herramientas técnicas y agrícolas.
Aquí tienes las especificaciones en bruto de un producto:
${productContext}

Escribe una descripción comercial y técnica (sales pitch) de máximo 2 párrafos para este producto. Resalta sus usos principales y características clave. Usa un tono vendedor pero profesional. No uses Markdown, solo texto plano. NO incluyas el código SKU en el texto. Empieza directamente con la descripción.`;

         const generateRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               contents: [{ role: 'user', parts: [{ text: prompt }] }],
               generationConfig: { maxOutputTokens: 2000, temperature: 0.3 }
            })
         });
         
         if (!generateRes.ok) throw new Error('Error en Gemini Generate');
         const generateData = await generateRes.json();
         let salesPitch = generateData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Producto técnico de alta calidad.';

         // b) Generar los Embeddings (Vectores) para la búsqueda semántica usando las especificaciones reales
         const nombreProd = p['Nombre del Producto'] || p['Brand'] || sku;
         const specsText = Object.entries(p)
            .filter(([k,v]) => v && String(v).trim() !== '' && !k.toLowerCase().includes('imagen') && !k.toLowerCase().includes('manual'))
            .map(([k,v]) => `${k}: ${v}`)
            .join(', ');
            
         const embedText = `Producto: ${nombreProd}. Especificaciones: ${specsText}. Descripción general: ${salesPitch}`;

         const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               model: 'models/gemini-embedding-2',
               content: { parts: [{ text: embedText }] },
               outputDimensionality: 768,
               taskType: "RETRIEVAL_DOCUMENT"
            })
         });

         if (!embedRes.ok) throw new Error('Error generando embeddings');
         const embedData = await embedRes.json();
         const embeddingVector = embedData.embedding.values;

         // c) Formatear especificaciones de manera limpia para el bot
         const ignoreKeys = ['imagen', 'manual', 'marcación pim', 'material antiguo', 'despiece', 'denominador estandar', 'volumen', 'peso neto', 'thumbnail', 'ficha tecnica', 'ficha', 'video', 'gama', 'brand logo'];
         let specsList = [];
         for (const [key, val] of Object.entries(p)) {
             const kLower = key.toLowerCase();
             if (ignoreKeys.some(ik => kLower.includes(ik))) continue;
             if (!val || val === '' || val === '0' || val === '0.0' || val === '0.00' || val === '0.000' || val === 0 || val === 'N/A' || val === 'null' || val === '-') continue;
             specsList.push(`• **${key}:** ${val}`);
         }
         const cleanSpecsText = specsList.length > 0 ? `\n\n**Especificaciones Técnicas:**\n${specsList.join('\n')}` : '';

         // d) Guardar en la base de datos Supabase
         const { error: insertError } = await supaAdmin.from('productos_ai_data').insert({
            sku: sku,
            sales_pitch: `${salesPitch}${cleanSpecsText}`,
            embedding: embeddingVector,
            created_at: new Date().toISOString()
         });

         if (insertError) throw insertError;
         
         processedSkus.push(sku);

       } catch (err) {
         errors.push({ sku, error: err.message });
       }
    }

    return new Response(JSON.stringify({ 
        message: 'Lote procesado exitosamente', 
        processed_count: processedSkus.length, 
        processed_skus: processedSkus,
        remaining_in_plytix: missingProducts.length - processedSkus.length,
        errors 
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
