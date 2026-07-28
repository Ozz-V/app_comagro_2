import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLYTIX_URL = Deno.env.get('PLYTIX_CHANNEL_URL') ?? 'https://pim.plytix.com/channels/69b2c94b558d8c2b27901090/feed';

Deno.serve(async (req: Request) => {
  try {
    // Health check
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/health')) {
      return new Response(JSON.stringify({ status: 'ok', service: 'sync-plytix', timestamp: new Date().toISOString() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';

    // Auth check: comparación constant-time para evitar ataques de timing
    const secret = req.headers.get('x-sync-secret') ?? '';
    const expected = Deno.env.get('SYNC_SECRET') ?? '';
    // Comparamos byte a byte con XOR para que el tiempo sea siempre igual sin importar el valor
    let mismatch = secret.length !== expected.length ? 1 : 0;
    const len = Math.max(secret.length, expected.length);
    for (let i = 0; i < len; i++) {
      mismatch |= (secret.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
    }
    if (mismatch !== 0) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    if (!supabaseUrl || !supabaseServiceKey || !geminiKey) {
      throw new Error('Faltan variables de entorno (Supabase o Gemini)');
    }

    const supaAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Obtener todos los productos de Plytix (6.2 Fallback de caché)
    let text = '';
    try {
      // Abort controller para no colgar la function si Plytix está lento
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(PLYTIX_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Plytix HTTP Error: ${res.status}`);
      text = await res.text();
    } catch (err) {
      console.warn('Fallback: Plytix feed inaccesible', err);
      return new Response(JSON.stringify({ error: 'Feed de Plytix inaccesible temporalmente', fallback: true, details: (err as Error).message }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    // deno-lint-ignore no-explicit-any
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

    // PASO A: INGESTA INSTANTANEA
    // Guardamos absolutamente todo el feed en la tabla de cola `plytix_queue`
    const upsertQueueData = plytixData
      .filter(p => p.SKU && String(p.SKU).trim() !== '' && String(p.SKU).trim().toUpperCase() !== 'UNDEFINED' && String(p.SKU).trim().toUpperCase() !== 'NULL')
      .map(p => ({
        sku: String(p.SKU).trim().toUpperCase(),
        raw_data: p,
        status: 'pending',
        updated_at: new Date().toISOString()
      }));

    if (upsertQueueData.length > 0) {
      // Lo dividimos en lotes de 500 para evitar que Supabase rechace el request por ser muy pesado
      const chunkSize = 500;
      for (let i = 0; i < upsertQueueData.length; i += chunkSize) {
        const chunk = upsertQueueData.slice(i, i + chunkSize);
        const { error: upsertErr } = await supaAdmin.from('plytix_queue').upsert(chunk, { onConflict: 'sku' });
        if (upsertErr) {
          console.error("Error ingesting chunk into plytix_queue:", upsertErr);
        }
      }
    }

    // PASO B: PROCESAMIENTO SEGURO
    // Tomamos un lote (batch) de máximo 10 productos que estén 'pending'
    const { data: queueItems, error: qErr } = await supaAdmin
      .from('plytix_queue')
      .select('*')
      .eq('status', 'pending')
      .order('updated_at', { ascending: true })
      .limit(10);

    if (qErr) {
        throw new Error(`Error leyendo la cola: ${qErr.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
       return new Response(JSON.stringify({ message: 'Todo está sincronizado. No hay productos pendientes en la cola.', processed: 0 }), { status: 200 });
    }

    const processedSkus: string[] = [];
    const errors = [];

    // Procesar cada producto del lote
    for (const item of queueItems) {
       const sku = item.sku;
       const p = item.raw_data;
       try {
         // a) Generar el Sales Pitch con IA
         const productContext = JSON.stringify(p, null, 2);
         const prompt = `Eres un redactor experto en herramientas técnicas y agrícolas.
Aquí tienes las especificaciones en bruto de un producto:
${productContext}

Escribe una descripción comercial y técnica (sales pitch) de EXACTAMENTE 1 párrafo para este producto (máximo 5 a 6 líneas). Resalta sus usos principales y características clave. Usa un tono vendedor pero profesional. No uses Markdown, solo texto plano. NO incluyas el código SKU en el texto. Empieza directamente con la descripción.`;

         const generateRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
            body: JSON.stringify({
               contents: [{ role: 'user', parts: [{ text: prompt }] }],
               generationConfig: { maxOutputTokens: 2000, temperature: 0.3 }
            })
         });
         
         if (!generateRes.ok) {
            const errText = await generateRes.text();
            console.error(`Gemini Error para ${sku}:`, errText);
            throw new Error(`Error en Gemini Generate: ${generateRes.status}`);
         }
         const generateData = await generateRes.json();
         let salesPitch = generateData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Producto técnico de alta calidad.';
         salesPitch = salesPitch.replace(/\*\*/g, '');

         // b) Generar los Embeddings (Vectores) para la búsqueda semántica usando las especificaciones reales
         const nombreProd = p['Nombre del Producto'] || p['Brand'] || sku;
         const specsText = Object.entries(p)
            .filter(([k,v]) => v && String(v).trim() !== '' && !k.toLowerCase().includes('imagen') && !k.toLowerCase().includes('manual'))
            .map(([k,v]) => `${k}: ${v}`)
            .join(', ');
            
         const embedText = `Producto: ${nombreProd}. Especificaciones: ${specsText}. Descripción general: ${salesPitch}`;

         const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
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
         const specsList = [];
         for (const [key, val] of Object.entries(p)) {
             const kLower = key.toLowerCase();
             if (ignoreKeys.some(ik => kLower.includes(ik))) continue;
             if (!val || val === '' || val === '0' || val === '0.0' || val === '0.00' || val === '0.000' || val === 0 || val === 'N/A' || val === 'null' || val === '-') continue;
             specsList.push(`• **${key}:** ${val}`);
         }
         const cleanSpecsText = specsList.length > 0 ? `\n\n**Especificaciones Técnicas:**\n${specsList.join('\n')}` : '';

         // d) Guardar en la base de datos Supabase (usando upsert para soportar modificaciones)
         const { error: insertError } = await supaAdmin.from('productos_ai_data').upsert({
            sku: sku,
            sales_pitch: `${salesPitch}${cleanSpecsText}`,
            embedding: embeddingVector,
            created_at: new Date().toISOString()
         }, { onConflict: 'sku' });

         if (insertError) throw insertError;
         
         // e) Marcar como completado en la cola
         await supaAdmin.from('plytix_queue').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('sku', sku);
         
         processedSkus.push(sku);

       } catch (err) {
         console.error(`Error procesando SKU ${sku}:`, (err as Error).message);
         errors.push({ sku, error: (err as Error).message });
         // Opcional: Marcar como error en la cola para no bloquear
         await supaAdmin.from('plytix_queue').update({ status: 'error', updated_at: new Date().toISOString() }).eq('sku', sku);
       }
    }

    // 6. Enviar notificaciones push si hubo productos procesados exitosamente
    if (processedSkus.length > 0) {
      try {
        const { data: profiles } = await supaAdmin.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null);
        if (profiles && profiles.length > 0) {
          const pushMessages = profiles.map(prof => ({
            to: prof.expo_push_token,
            sound: 'default',
            title: '¡Nuevo Producto o Actualización!',
            body: `Se han procesado ${processedSkus.length} producto(s) en el catálogo, incluyendo SKU: ${processedSkus[0]}. ¡Revisalo!`,
            data: { skus: processedSkus },
          }));
          
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pushMessages),
          });
        }
      } catch (err) {
        console.error('Error enviando push notifications:', err);
      }
    }

    // Contar cuántos quedan pendientes en la cola total
    const { count: remainingCount } = await supaAdmin.from('plytix_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending');

    return new Response(JSON.stringify({ 
        message: 'Lote procesado exitosamente', 
        processed_count: processedSkus.length, 
        processed_skus: processedSkus,
        remaining_in_queue: remainingCount || 0,
        errors 
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
