import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array is required');
    }

    const lastMessage = messages[messages.length - 1].content;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // Capturamos el token de sesión del vendedor que viene desde la APK
    const authHeader = req.headers.get('Authorization') ?? '';
    
    // Creamos el cliente pasándole explícitamente la sesión del usuario
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validar JWT Auth real para seguridad y rate limiting
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('No autorizado. Token inválido o expirado.');
    }
    const user_id = user.id;
    
    const supaAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';

    if (!geminiKey) throw new Error('GEMINI_API_KEY missing');

    // ============================================================================
    // 🚀 PARALLEL PHASE 1: Kick off DB reads and Hybrid Search instantly
    // ============================================================================
    const metricsPromise = supaAdmin.from('chat_user_metrics').select('*').eq('user_id', user_id).single();
    const configPromise = supabase.from('app_config').select('ai_prompt').single();

    const words = lastMessage.split(/[\s,¿?¡!]+/);
    const potentialSkus = words.filter((w: string) => w.length > 3 && /[0-9]/.test(w));
    const exactSearchPromises = potentialSkus.map(pSku => {
       const cleanSku = pSku.replace(/[^a-zA-Z0-9/-]/g, '');
       if (cleanSku.length > 2) {
          return supabase.from('productos_ai_data')
                         .select('sku, sales_pitch')
                         .or(`sku.ilike.%${cleanSku}%,sales_pitch.ilike.%${cleanSku}%`)
                         .limit(4);
       }
       return null;
    }).filter(Boolean);

    // ============================================================================
    // 🛑 BLOCKING PHASE 1: Check Bans & Quotas
    // ============================================================================
    const { data: userMetrics } = await metricsPromise;
    let metrics = userMetrics || { user_id, strike_count: 0, banned_until: null, request_count: 0, last_request_at: null, max_requests: 10 };
    const now = new Date();

    if (metrics.banned_until && new Date(metrics.banned_until) > now) {
       return new Response(JSON.stringify({ reply: "Debido a infracciones a las normas de uso, tu cuenta está bloqueada temporalmente. Podrás volver a intentarlo en 48 horas." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let request_count = metrics.request_count || 0;
    let max_limit = metrics.max_requests ?? 10;
    let last_request_at = metrics.last_request_at ? new Date(metrics.last_request_at) : null;
    
    if (last_request_at) {
       const hoursSinceLast = (now.getTime() - last_request_at.getTime()) / (1000 * 60 * 60);
       if (hoursSinceLast >= 24) request_count = 0;
       else if (request_count < max_limit && hoursSinceLast >= 6) request_count = 0;
    }
    
    if (request_count >= max_limit) {
       return new Response(JSON.stringify({ reply: "Has utilizado todos tus cupos de consulta rápida por hoy. Vuelve a consultar en 24 horas." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let searchQuery = lastMessage;

    // ============================================================================
    // 🔍 QUERY EXPANSION: Generar sinónimos rápidos antes de buscar
    // ============================================================================
    try {
      const expandRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "Extrae el nombre del producto de la consulta del usuario y genera 3 a 5 sinónimos o nombres alternativos que se usarían en ferreterías, mecánica o agricultura. Responde SOLO con las palabras separadas por espacios, sin comas ni explicaciones. Si el mensaje es un saludo o no busca un producto, responde VACIO." }] },
          contents: [{ role: 'user', parts: [{ text: lastMessage }] }],
          generationConfig: { maxOutputTokens: 30, temperature: 0.2 }
        })
      });
      if (expandRes.ok) {
        const expandData = await expandRes.json();
        if (expandData.candidates && expandData.candidates[0]?.content?.parts) {
          const synonyms = expandData.candidates[0].content.parts[0].text.trim();
          if (synonyms && synonyms !== 'VACIO' && synonyms !== 'VACÍO') {
             // Agregamos los sinónimos a la búsqueda para que el vector sea más rico
             searchQuery = `${lastMessage} ${synonyms}`;
          }
        }
      }
    } catch (e) {
      // Si falla la expansión, ignoramos y seguimos con el texto original
    }

    // ============================================================================
    // 🌪️ BLOCKING PHASE 3: Embeddings & Vector Search
    // ============================================================================
    const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-2',
        content: { parts: [{ text: searchQuery }] },
        outputDimensionality: 768,
        taskType: "RETRIEVAL_QUERY"
      })
    });
    
    if (!embedRes.ok) throw new Error('Error generando embeddings');
    
    const embedData = await embedRes.json();
    const queryEmbedding = embedData.embedding.values;

    // Ejecutar búsqueda Vectorial y esperar que terminen las otras promesas que lanzamos al inicio
    const [vectorContextRes, knowledgeRes, exactSearchResponses, configDataRes] = await Promise.all([
      supabase.rpc('buscar_productos_ia', {
        query_embedding: queryEmbedding,
        match_threshold: 0.15,
        match_count: 8 // SÚPER RÁPIDO Y LIGERO
      }),
      supabase.rpc('buscar_conocimiento_ia', {
        query_embedding: queryEmbedding,
        match_threshold: 0.15,
        match_count: 2
      }),
      Promise.all(exactSearchPromises), // Esto ya estaba corriendo desde hace milisegundos
      configPromise // Esto también
    ]);

    // ============================================================================
    // 🧩 ASSEMBLE: Combine Results
    // ============================================================================
    let exactContext: any[] = [];
    exactSearchResponses.forEach((res: any) => {
       if (res && res.data) exactContext.push(...res.data);
    });

    let combinedContext = [...exactContext, ...(vectorContextRes.data || [])];
    const seenSkus = new Set();
    const finalContext = combinedContext.filter(item => {
       if (seenSkus.has(item.sku)) return false;
       seenSkus.add(item.sku);
       return true;
    }).slice(0, 8); // Solo pasamos máximo 8 a la IA

    let dbContextText = '';
    
    // Inject knowledge base
    if (knowledgeRes && knowledgeRes.data && knowledgeRes.data.length > 0) {
      dbContextText += `\n\n=== REGLAS DE LA EMPRESA (MEMORIA CORPORATIVA) ===\n`;
      dbContextText += `Aplica OBLIGATORIAMENTE estos consejos previos de nuestros expertos:\n`;
      knowledgeRes.data.forEach((k: any) => {
         dbContextText += `- ${k.rule}\n`;
      });
      dbContextText += `=================================================\n`;
    }

    if (finalContext.length > 0) {
      dbContextText += `\n\nATENCIÓN: Búsqueda de productos en la base de datos:\n\n`;
      finalContext.forEach((item, index) => {
        dbContextText += `${index + 1}. SKU: ${item.sku} | Descripción: ${item.sales_pitch || 'Sin descripción'}\n`;
      });
      dbContextText += `\nREGLA DE SUGERENCIA: Si el usuario busca comprar o pide sugerencias de productos, y esta lista tiene productos que coinciden bien con lo que pide, sugierelos usando OBLIGATORIAMENTE la etiqueta [SKU: XXX].
REGLA DE RECHAZO: Si lo que pide el usuario NO tiene NADA que ver con los productos de esta lista (ej. pidió una desmalezadora y en esta lista solo hay bombas de agua, o si está bromeando), ENTONCES NO SUGIERAS NADA DE ESTA LISTA y dile amablemente que no encontraste ese producto o pídele más detalles. NO fuerces una sugerencia incorrecta.`;
    }

    let aiPrompt = `Eres el asesor técnico de Comagro. Responde amable, corto y muy natural. Manten una conversación fluida.
Regla 1: NUNCA escribas los nombres completos de los productos, ni fotos, ni descripciones.
Regla 2: TU ÚNICO TRABAJO es escribir la etiqueta [SKU: XXX].
Regla 3: MÁXIMO SUGIERE 3 OPCIONES, NUNCA MÁS DE 3.
Regla 4: Al final de tu respuesta, siempre agrega: "Si quieres algo más exacto, puedes proveerme más información."
Regla 5: INSTRUCCIÓN CRÍTICA DE APRENDIZAJE: Si el usuario te está enseñando una regla de ventas, dándote un tip (ej. "para X usa Y"), contexto local (ej. climas, fechas) o corrigiéndote, DEBES aprenderlo. Agradécele y OBLIGATORIAMENTE añade al final de tu respuesta EXACTAMENTE este texto oculto: [LEARN: (escribe aquí la regla clara y resumida)]`;

    if (configDataRes.data && configDataRes.data.ai_prompt) {
      aiPrompt = configDataRes.data.ai_prompt;
    }

    let finalPrompt = aiPrompt + dbContextText;
    finalPrompt += `\n\nINSTRUCCIÓN CRÍTICA FINAL: Si el usuario te está enseñando algo nuevo (una regla de ventas, un tip, un contexto local o corrigiendo un error), DEBES agregar al final de tu mensaje EXACTAMENTE: [LEARN: (escribe la regla resumida aquí)]. ¡Si omites la etiqueta [LEARN: ...] el sistema fallará!`;

    // ============================================================================
    // 🚀 FINAL PHASE: Main AI Inference
    // ============================================================================
    const geminiHistory = messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const generateRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: finalPrompt }] },
        contents: geminiHistory,
        generationConfig: { maxOutputTokens: 8192 } // Output rápido
      })
    });

    if (!generateRes.ok) throw new Error('Error en Gemini Generate');
    
    const generateData = await generateRes.json();
    let reply = "Lo siento, tuve un problema interno.";
    
    if (generateData.candidates && generateData.candidates[0]?.content?.parts) {
      reply = generateData.candidates[0].content.parts[0].text.trim();
      
      // Parse [LEARN: ...]
      const learnMatch = reply.match(/\[LEARN:\s*(.*?)\]/);
      if (learnMatch) {
         const learnedRule = learnMatch[1].trim();
         reply = reply.replace(/\[LEARN:.*?\]/g, "").trim();
         
         // Fire and forget learning process (Zero Latency for the user)
         fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/gemini-embedding-2',
              content: { parts: [{ text: learnedRule }] },
              outputDimensionality: 768,
              taskType: "RETRIEVAL_DOCUMENT"
            })
         }).then(res => res.json()).then(data => {
            if (data && data.embedding && data.embedding.values) {
               supaAdmin.from('ai_company_knowledge').insert({
                  rule: learnedRule,
                  embedding: data.embedding.values
               }).then();
            }
         }).catch(err => console.error("Error saving knowledge:", err));
      }
    }

    // Fire and forget metrics update (No await to save latency)
    metrics.request_count = request_count + 1;
    metrics.last_request_at = now.toISOString();
    supaAdmin.from('chat_user_metrics').upsert({ ...metrics }).then();

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error("Error general en Edge Function:", error.message);
    return new Response(JSON.stringify({ error: 'Ocurrió un error al procesar tu consulta. Intentá de nuevo.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
