export async function extractIntent(chatHistoryText: string, geminiKey: string): Promise<string[] | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Eres el motor de búsqueda interno. Tu trabajo es leer el historial de chat y deducir EXACTAMENTE qué productos distintos está buscando el usuario en su ÚLTIMO mensaje. Usa el historial solo para dar contexto (por ejemplo si dice 'dame el de 2hp', te refieres a 'motor de 2hp' si antes hablaban de motores). NO repitas productos que el usuario pidió en mensajes pasados y que ya fueron respondidos. Responde ÚNICAMENTE con un array JSON de strings, donde cada string es una frase de búsqueda corta (2 a 5 palabras). Ejemplo: si el último mensaje dice 'tambien necesito un cortacesped', respondes: [\"cortacesped\"]. Si es un solo producto, devuelve un array de 1 elemento." }] },
        contents: [{ role: 'user', parts: [{ text: chatHistoryText }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.1, responseMimeType: "application/json" }
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts) {
        const text = data.candidates[0].content.parts[0].text.trim();
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (err) {}
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ event: "intent_extraction_failed", error: String(e) }));
  }
  return null;
}

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

export async function vectorSearch(supabase: any, queryEmbedding: number[]): Promise<{ products: any[]; knowledge: any[] }> {
  try {
    const [vRes, kRes] = await Promise.all([
      supabase.rpc('buscar_productos_ia', { query_embedding: queryEmbedding, match_threshold: 0.15, match_count: 8 }),
      supabase.rpc('buscar_conocimiento_ia', { query_embedding: queryEmbedding, match_threshold: 0.15, match_count: 2 })
    ]);
    return { products: vRes.data || [], knowledge: kRes.data || [] };
  } catch (e) {
    console.error(JSON.stringify({ event: "vector_search_failed", error: String(e) }));
    return { products: [], knowledge: [] };
  }
}
