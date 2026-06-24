export async function extractIntent(chatHistoryText: string, geminiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Eres el motor de búsqueda interno. Tu trabajo es leer el historial de chat y deducir EXACTAMENTE qué producto está buscando el usuario AHORA. Responde ÚNICAMENTE con una frase corta (2 a 5 palabras) con el producto, la marca o la especificación. Ejemplo: si venían hablando de desbrozadoras y el usuario dice 'tienen marca Daewoo?', tú respondes: 'desbrozadora daewoo'. Si dice 'y de 5hp?', respondes: 'desbrozadora 5hp'. Responde SOLO con los términos de búsqueda." }] },
        contents: [{ role: 'user', parts: [{ text: chatHistoryText }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.1 }
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts) {
        const q = data.candidates[0].content.parts[0].text.trim();
        if (q && q !== '') return q;
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
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
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
