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
    let metrics = userMetrics || { user_id, strike_count: 0, banned_until: null, request_count: 0, last_request_at: null };
    const now = new Date();

    if (metrics.banned_until && new Date(metrics.banned_until) > now) {
       return new Response(JSON.stringify({ reply: "Debido a infracciones a las normas de uso, tu cuenta está bloqueada temporalmente. Podrás volver a intentarlo en 48 horas." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let request_count = metrics.request_count || 0;
    let last_request_at = metrics.last_request_at ? new Date(metrics.last_request_at) : null;
    
    if (last_request_at) {
       const hoursSinceLast = (now.getTime() - last_request_at.getTime()) / (1000 * 60 * 60);
       if (hoursSinceLast >= 24) request_count = 0;
       else if (request_count < 5 && hoursSinceLast >= 6) request_count = 0;
    }
    
    if (request_count >= 5) {
       return new Response(JSON.stringify({ reply: "Has utilizado todos tus cupos de consulta rápida por hoy. Vuelve a consultar en 24 horas." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============================================================================
    // 🧠 BLOCKING PHASE 2: Query Expansion (Intent & Stupidity Check)
    // ============================================================================
    const recentHistory = messages.slice(-3).map((m: any) => `${m.role}: ${m.content}`).join('\\n');
    const intentPrompt = `Historial reciente de conversación:\n${recentHistory}\n\nAnaliza el historial completo y el último mensaje del usuario.
Si el usuario te está enseñando una regla de ventas, dándote un tip de recomendación, contexto geográfico/clima, o corrigiendo un error, devuelve SOLO 3 o 4 palabras clave relacionadas a esa regla. NUNCA devuelvas STUPID en este caso.
Si el usuario pregunta algo totalmente irrelevante (comida, fútbol, chistes), devuelve EXACTAMENTE Y ÚNICAMENTE la palabra "STUPID".
Si el usuario pide una categoría MUY GENERAL sin detalles (ej. "quiero un motor", "bombas de agua") y no hay contexto previo, devuelve EXACTAMENTE "VAGUE: " seguido de una pregunta muy corta para pedir detalles.
Si el mensaje sí tiene contexto o detalles (ej. "motor de 2hp", "wasko 500") o responde a tu pregunta, devuelve SOLO 3 o 4 palabras clave técnicas. NO des explicaciones.`;

    const intentRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: intentPrompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.1 } // OPTIMIZADO: Pocos tokens
      })
    });

    let searchQuery = lastMessage;
    if (intentRes.ok) {
      const intentData = await intentRes.json();
      if (intentData.candidates && intentData.candidates[0]?.content?.parts) {
         const keywords = intentData.candidates[0].content.parts[0].text.trim();
         
         if (keywords === "STUPID") {
            metrics.strike_count = (metrics.strike_count || 0) + 1;
            let replyMsg = "";
            if (metrics.strike_count === 1) {
               replyMsg = "No puedo ayudarte con eso, soy un asistente técnico. Puedes usar Google u otro buscador.";
               await supaAdmin.from('chat_user_metrics').upsert({ ...metrics, last_request_at: now.toISOString() });
            } else {
               metrics.banned_until = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
               replyMsg = "Lastimosamente no podemos seguir con la conversación. Podrás intentarlo más tarde.";
               await supaAdmin.from('chat_user_metrics').upsert({ ...metrics });
            }
            return new Response(JSON.stringify({ reply: replyMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
         }

         if (keywords.startsWith("VAGUE:")) {
            // Respuestas instántaneas a consultas vagas sin gastar tokens de búsqueda
            metrics.request_count = request_count + 1;
            metrics.last_request_at = now.toISOString();
            supaAdmin.from('chat_user_metrics').upsert({ ...metrics }).then();
            const vagueReply = keywords.replace("VAGUE:", "").trim();
            return new Response(JSON.stringify({ reply: vagueReply }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
         }

         if (keywords !== "NONE" && keywords.length > 2) {
            searchQuery = keywords;
         }
      }
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
      dbContextText += `\n\nATENCIÓN: Búsqueda exitosa. Basado en la base de datos, estos son los productos más relevantes (NO INVENTES OTROS):\n\n`;
      finalContext.forEach((item, index) => {
        dbContextText += `${index + 1}. SKU: ${item.sku} | Descripción: ${item.sales_pitch || 'Sin descripción'}\n`;
      });
      dbContextText += `\nREGLA DE ORO 1: SI EL USUARIO PIDE UN PRODUCTO, SUGIERE UNO DE ESTOS Y OBLIGATORIAMENTE INCLUYE LA ETIQUETA [SKU: XXX].
REGLA DE ORO 2: Si el usuario pide una capacidad específica (ej. 100 kVA, 500kva, 2 HP) y no tienes la exacta en esta lista, DEBES sugerir la opción más cercana (por arriba o por debajo) de la misma marca o similar. NUNCA digas simplemente "no tengo" sin ofrecer la alternativa más aproximada de la lista.`;
    }

    let aiPrompt = `Eres el asesor técnico de Comagro. Responde amable, corto y profesional.
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
