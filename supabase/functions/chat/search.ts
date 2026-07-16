export async function extractIntent(chatHistoryText: string, geminiKey: string): Promise<string[][] | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Eres el motor de búsqueda interno. Tu trabajo es leer el historial de chat y deducir EXACTAMENTE qué productos está buscando el usuario en su ÚLTIMO mensaje. ¡OJO CON EL HISTORIAL! Usa el historial solo para entender el contexto, pero NO MEZCLES características de los productos anteriores con el nuevo pedido. Si antes pidió una 'bomba' y ahora pide un 'motor', busca SOLO 'motor'. IMPORTANTE: devuelve un GRUPO (array) de 3 a 5 frases de búsqueda cortas (2 a 4 palabras) que incluyan variantes, sinónimos y variaciones morfológicas (ej. nafta -> naftero, gasolina; motor -> motor trifasico, motor monofasico). Responde ÚNICAMENTE con un array JSON de arrays de strings. Ejemplo: [[\"motor 100 hp\",\"motor trifasico 100 hp\",\"motor electrico 100 hp\"]]." }] },
        contents: [{ role: 'user', parts: [{ text: chatHistoryText }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.2, responseMimeType: "application/json" }
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts) {
        const text = data.candidates[0].content.parts[0].text.trim();
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Normaliza: si el modelo devolvió strings sueltos en vez de sub-arrays, los envolvemos igual
            // deno-lint-ignore no-explicit-any
            return parsed.map((g: any) => (Array.isArray(g) ? g.filter(Boolean) : [String(g)]));
          }
        } catch (_err) { /* ignore parse error */ }
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ event: "intent_extraction_failed", error: String(e) }));
  }
  return null;
}

// deno-lint-ignore no-explicit-any
export async function getEmbedding(text: string, geminiKey: string, supaAdmin: any): Promise<{ embedding: number[] | null; cacheHit: boolean }> {
  const cacheKey = text.toLowerCase().trim();

  // Try cache first
  try {
    const { data: cacheHitData } = await supaAdmin
      .from('search_embeddings_cache')
      .select('embedding')
      .eq('query_text', cacheKey)
      .single();

    if (cacheHitData?.embedding) {
      return { embedding: cacheHitData.embedding, cacheHit: true };
    }
  } catch (_) { /* Cache miss or table doesn't exist */ }

  // Call Gemini API
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        model: 'models/gemini-embedding-2',
        content: { parts: [{ text }] },
        outputDimensionality: 768,
        taskType: "RETRIEVAL_QUERY"
      })
    });

    if (res.ok) {
      const data = await res.json();
      const embedding = data.embedding.values;
      supaAdmin.from('search_embeddings_cache').insert({ query_text: cacheKey, embedding }).then().catch(() => {});
      return { embedding, cacheHit: false };
    }
  } catch (e) {
    console.error(JSON.stringify({ event: "embedding_failed", error: String(e) }));
  }
  return { embedding: null, cacheHit: false };
}

// deno-lint-ignore no-explicit-any
export async function vectorSearch(supabase: any, queryEmbedding: number[]): Promise<{ products: any[]; knowledge: any[] }> {
  try {
    const [vRes, kRes] = await Promise.all([
      supabase.rpc('buscar_productos_ia', { query_embedding: queryEmbedding, match_threshold: 0.45, match_count: 10 }),
      supabase.rpc('buscar_conocimiento_ia', { query_embedding: queryEmbedding, match_threshold: 0.45, match_count: 3 })
    ]);
    if (vRes.error) console.error(JSON.stringify({ event: "vector_rpc_error", error: vRes.error }));
    if (kRes.error) console.error(JSON.stringify({ event: "knowledge_rpc_error", error: kRes.error }));
    return { products: vRes.data || [], knowledge: kRes.data || [] };
  } catch (e) {
    console.error(JSON.stringify({ event: "vector_search_failed", error: String(e) }));
    return { products: [], knowledge: [] };
  }
}

// NUEVO: búsqueda de texto literal, usando todas las variantes/sinónimos de un mismo
// grupo de búsqueda (generadas por extractIntent). Sirve de red de seguridad cuando
// el embedding semántico no encuentra bien un producto, pero el texto sí coincide.
// Palabras vacías: si las dejáramos, un match por "de" o "para" haría que
// prácticamente cualquier producto del catálogo entre como candidato.
const STOPWORDS = new Set([
  'a', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'en', 'con', 'sin', 'para', 'por', 'que', 'al', 'su', 'sus'
]);

// deno-lint-ignore no-explicit-any
export async function keywordSearch(supabase: any, phrases: string[]): Promise<any[]> {
  try {
    // IMPORTANTE: no buscamos cada frase completa y pegada ("motobomba a combustion").
    // En la ficha real del producto las palabras casi nunca aparecen juntas y en ese
    // orden exacto (ej: "Motobomba Diesel... Tipo de Producto: BOMBA A COMBUSTIÓN",
    // en partes distintas del texto). Por eso partimos cada frase en palabras sueltas
    // significativas y buscamos cualquiera de ellas por separado — esto generaliza
    // solo, sin necesidad de mapear categorías de producto a mano.
    const andGroups: string[] = [];
    
    phrases.slice(0, 4).forEach(phrase => {
      const words = new Set<string>();
      phrase
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .forEach(w => {
          const clean = w.replace(/[^a-záéíóúñ0-9]/gi, '');
          if (clean.length > 1 && !STOPWORDS.has(clean)) words.add(clean);
        });
        
      const terms = Array.from(words).slice(0, 6);
      if (terms.length > 0) {
        const andStr = terms.map(t => `sales_pitch.ilike.*${t.replace(/[%,()*]/g, '')}*`).join(',');
        andGroups.push(`and(${andStr})`);
      }
    });

    if (andGroups.length === 0) return [];
    
    const orFilter = andGroups.join(',');

    const query = supabase
      .from('productos_ai_data')
      .select('sku, sales_pitch')
      .or(orFilter)
      .limit(6);

    const { data, error } = await query;

    if (error) {
      console.error(JSON.stringify({ event: "keyword_search_failed", error: error.message }));
      return [];
    }
    return data || [];
  } catch (e) {
    console.error(JSON.stringify({ event: "keyword_search_failed", error: String(e) }));
    return [];
  }
}
