import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDefaultMetrics, checkBan, resetCountersIfNeeded, checkQuotaExceeded, processStrike } from "./metrics.ts";
import { extractIntent, getEmbedding, vectorSearch } from "./search.ts";
import { generateResponse, parseLearnTag, saveLearnedRule } from "./ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    let { messages } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array is required');
    }

    const lastMessage = messages[messages.length - 1].content;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('No autorizado. Token inválido o expirado.');
    const user_id = user.id;

    const supaAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
    if (!geminiKey) throw new Error('GEMINI_API_KEY missing');

    // ── Metrics & Bans ──
    const { data: userMetrics } = await supaAdmin.from('chat_user_metrics').select('*').eq('user_id', user_id).single();
    let metrics = userMetrics || getDefaultMetrics(user_id);
    const now = new Date();

    const banMsg = checkBan(metrics, now);
    if (banMsg) return new Response(JSON.stringify({ reply: banMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let request_count = resetCountersIfNeeded(metrics, now);
    const quotaMsg = checkQuotaExceeded(request_count, metrics.max_requests ?? 10);
    if (quotaMsg) return new Response(JSON.stringify({ reply: quotaMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // ── Parallel kickoffs ──
    const configPromise = supabase.from('app_config').select('ai_prompt').single();

    const words = lastMessage.split(/[\s,¿?¡!]+/);
    const potentialSkus = words.filter((w: string) => w.length > 3 && /[0-9]/.test(w));
    const exactSearchPromises = potentialSkus.map(pSku => {
      const cleanSku = pSku.replace(/[^a-zA-Z0-9/-]/g, '');
      if (cleanSku.length > 2) {
        return supabase.from('productos_ai_data').select('sku, sales_pitch').or(`sku.ilike.%${cleanSku}%,sales_pitch.ilike.%${cleanSku}%`).limit(4);
      }
      return null;
    }).filter(Boolean);

    // ── Search Pipeline ──
    let searchQuery = lastMessage;
    const recentMessages = messages.slice(-4);
    const chatHistoryText = recentMessages.map((m: any) => `${m.role}: ${m.content}`).join('\n');

    const exactSearchResponses = await Promise.all(exactSearchPromises);
    let exactContext: any[] = [];
    exactSearchResponses.forEach((res: any) => { if (res?.data) exactContext.push(...res.data); });

    let vectorData: any[] = [];
    let knowledgeData: any[] = [];
    let cacheHit = false;

    if (exactContext.length === 0) {
      const intent = await extractIntent(chatHistoryText, geminiKey);
      if (intent) searchQuery = intent;

      const embResult = await getEmbedding(searchQuery, geminiKey, supaAdmin);
      cacheHit = embResult.cacheHit;

      if (embResult.embedding) {
        const vResult = await vectorSearch(supabase, embResult.embedding);
        vectorData = vResult.products;
        knowledgeData = vResult.knowledge;
      }
    }

    const configDataRes = await configPromise;

    // ── Assemble Context ──
    let combinedContext = [...exactContext, ...vectorData];
    const seenSkus = new Set();
    const finalContext = combinedContext.filter(item => {
      if (seenSkus.has(item.sku)) return false;
      seenSkus.add(item.sku);
      return true;
    }).slice(0, 8);

    let dbContextText = '';
    if (knowledgeData.length > 0) {
      dbContextText += `\n\n=== REGLAS DE LA EMPRESA (MEMORIA CORPORATIVA) ===\n`;
      dbContextText += `Aplica OBLIGATORIAMENTE estos consejos previos de nuestros expertos:\n`;
      knowledgeData.forEach((k: any) => { dbContextText += `- ${k.rule}\n`; });
      dbContextText += `=================================================\n`;
    }

    if (finalContext.length > 0) {
      dbContextText += `\n\nATENCIÓN: Búsqueda de productos en la base de datos:\n\n`;
      finalContext.forEach((item, index) => {
        dbContextText += `${index + 1}. SKU: ${item.sku} | Descripción: ${item.sales_pitch || 'Sin descripción'}\n`;
      });
      dbContextText += `\nREGLA DE SUGERENCIA Y ALTERNATIVAS: NUNCA dejes al usuario sin opciones. Si la lista no tiene el producto exacto que pidió (ej. pide motobomba 5HP y solo hay motores o bombas de 4HP/10HP), ofrécele OBLIGATORIAMENTE los productos de esta lista como alternativas viables explicándole la diferencia. NUNCA ocultes los productos que trajo la base de datos, SIEMPRE sugiere usando la etiqueta [SKU: XXX].`;
    }

    let aiPrompt = `Eres el asesor técnico de Comagro. Responde amable, corto y muy natural. Manten una conversación fluida.
Regla 1: NUNCA escribas los nombres completos de los productos, ni fotos, ni descripciones.
Regla 2: TU ÚNICO TRABAJO es escribir la etiqueta [SKU: XXX].
Regla 3: MÁXIMO SUGIERE 3 OPCIONES, NUNCA MÁS DE 3.
Regla 4: Al final de tu respuesta, siempre agrega: "Si quieres algo más exacto, puedes proveerme más información."
Regla 5: INSTRUCCIÓN CRÍTICA DE APRENDIZAJE: Si el usuario te está enseñando una regla de ventas, dándote un tip (ej. "para X usa Y"), contexto local (ej. climas, fechas) o corrigiéndote, DEBES aprenderlo. Agradécele y OBLIGATORIAMENTE añade al final de tu respuesta EXACTAMENTE este texto oculto: [LEARN: (escribe aquí la regla clara y resumida)]`;

    if (configDataRes.data?.ai_prompt) aiPrompt = configDataRes.data.ai_prompt;

    let finalPrompt = aiPrompt + dbContextText;
    finalPrompt += `\n\nINSTRUCCIÓN CRÍTICA FINAL: Si el usuario te está enseñando algo nuevo (una regla de ventas, un tip, un contexto local o corrigiendo un error), DEBES agregar al final de tu mensaje EXACTAMENTE: [LEARN: (escribe la regla resumida aquí)]. ¡Si omites la etiqueta [LEARN: ...] el sistema fallará!\nREGLA DE STRIKE: Si el usuario hace una pregunta completamente fuera de lugar (ej. chistes, política, deportes, qué hay de cenar) que NO tenga relación con herramientas, agricultura o Comagro, respóndele que no puedes ayudar con eso y OBLIGATORIAMENTE añade al final de tu respuesta la etiqueta oculta: [STRIKE]`;

    // ── AI Response ──
    const geminiHistory = messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    let reply = await generateResponse(finalPrompt, geminiHistory, geminiKey);

    // Parse tags
    reply = processStrike(reply, metrics);
    const { cleanReply, learnedRule } = parseLearnTag(reply);
    reply = cleanReply;
    if (learnedRule) saveLearnedRule(learnedRule, geminiKey, supaAdmin);

    // Update metrics (fire and forget)
    if (metrics.strike_count < 2) metrics.request_count = request_count + 1;
    metrics.last_request_at = now.toISOString();
    supaAdmin.from('chat_user_metrics').upsert({ ...metrics }).then();

    // ── Structured Log ──
    console.log(JSON.stringify({
      event: "chat_complete",
      user_id,
      search_query: searchQuery,
      results_count: finalContext.length,
      exact_match: exactContext.length > 0,
      cache_hit: cacheHit,
      strike: reply.includes("suspendido"),
      duration_ms: Date.now() - startTime
    }));

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(JSON.stringify({ event: "chat_error", error: error.message, duration_ms: Date.now() - startTime }));
    return new Response(JSON.stringify({ error: 'Ocurrió un error al procesar tu consulta. Intentá de nuevo.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
