import { fetchGeminiWithRotation } from "./gemini.ts";

export async function extractIntent(chatHistoryText: string): Promise<string[][] | null> {
  try {
    const data = await fetchGeminiWithRotation(() => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`,
      body: {
        systemInstruction: { parts: [{ text: "Eres el motor de búsqueda interno. Tu trabajo es leer el historial de chat y deducir EXACTAMENTE qué productos está buscando el usuario en su ÚLTIMO mensaje. ¡OJO CON EL HISTORIAL! Usa el historial solo para entender el contexto, pero NO MEZCLES características de productos anteriores con el nuevo pedido. Si pide una 'bomba' y un 'motor' en el MISMO mensaje, debes buscar ambos. REGLA DE ORO: Si el usuario escribe en PLURAL, INCLUYE obligatoriamente la versión en SINGULAR. IMPORTANTE SOBRE PEDIDOS MÚLTIPLES: Cada vez que detectes un producto DISTINTO solicitado, debes crearle un GRUPO (sub-array) independiente con sus propias 3 a 5 variantes y sinónimos. REGLA DE CONVERSIÓN DE UNIDADES: Nuestro catálogo describe cada producto en la unidad de medida estándar de su rubro (ej. generadores en kVA y voltaje, bombas en m3/h de caudal, compresores en bar o PSI de presión, motores en kW o HP, pesos en kg, capacidades en litros, etc.), y esa unidad puede no coincidir con la que use el cliente en su pedido. Si el usuario expresa su requerimiento en CUALQUIER unidad de medida (amperios, PSI, libras, litros por minuto, pies cúbicos, caballos de fuerza, o cualquier otra), primero identificá cuál es la unidad estándar del catálogo para ese tipo de producto y convertí vos mismo el valor a esa unidad — no importa la magnitud física de la que se trate (eléctrica, de presión, de caudal, de peso, de potencia, etc.), siempre sos capaz de hacer la conversión. Agregá esas variantes YA CONVERTIDAS a la unidad del catálogo como parte de las variantes de búsqueda del grupo correspondiente, ADEMÁS de las variantes normales por nombre/sinónimo de producto. Si la conversión depende de un dato que no te dieron (ej. amperios a kVA depende del voltaje y de si es monofásico o trifásico), no te frenes por eso: generá variantes para los 2 o 3 escenarios más comunes de nuestro mercado. Nunca dejes la búsqueda apoyada solo en el número literal que escribió el usuario si esa unidad no es la que usa el catálogo. Responde ÚNICAMENTE con un array JSON de arrays de strings. Ejemplo para 1 producto: [[\"panel solar\",\"paneles solares\"]]. Ejemplo si pide 2 productos distintos a la vez (ej. una bomba y un motor): [[\"bomba de agua\",\"bombas de agua\"], [\"motor electrico\",\"motores electricos\"]]. Ejemplo con conversión de unidades (eléctrica): pedido 'generador de 10 A' -> [[\"generador\",\"generadores\",\"generador 2.2 kva\",\"generador 6.6 kva\",\"grupo electrogeno\"]]. Ejemplo con conversión de unidades (caudal): pedido 'bomba que mueva 40 m3 por hora' -> [[\"bomba de agua\",\"bombas de agua\",\"bomba 40000 l/h\",\"bomba 40 m3/h\"]]. Ejemplo con conversión de unidades (presión): pedido 'compresor de 90 psi' -> [[\"compresor\",\"compresores\",\"compresor 6.2 bar\"]]. REGLA DE ACCESORIOS SUELTOS: si el usuario pide un accesorio o repuesto suelto (arnés, correa, chaleco, funda, cable, etc.) PARA una máquina, generá el grupo enfocado en el accesorio en sí (ej. 'arnes', 'arnes de seguridad', 'chaleco reflectante') y NO repitas el nombre de la máquina en cada variante — si lo hacés, el buscador de texto suele encontrar la máquina COMPLETA (porque su propia ficha menciona ese accesorio como incluido) en vez del accesorio en sí, que es justo lo que hay que evitar. CATEGORÍAS RELACIONADAS: algunos términos de máquinas se superponen mucho en la jerga del rubro sin ser exactamente lo mismo (ej. podadora, desmalezadora, bordeadora y motoguadaña son categorías cercanas que suelen confundirse). Cuando el pedido sea sobre un accesorio, repuesto, o la máquina en sí de una de estas categorías, agregá TAMBIÉN al mismo grupo las variantes de las categorías cercanas (ej. si piden 'chaleco para podadora', incluí en el mismo grupo tanto 'chaleco para podadora' como 'chaleco para desmalezadora' y 'arnes para desmalezadora'), para que la búsqueda no se quede corta solo por una diferencia de nombre regional. Esto es SOLO para ensanchar la búsqueda -- la decisión de aclarar la diferencia al usuario la toma después el asesor, vos no tenés que resolverlo acá. SINÓNIMOS OBLIGATORIOS DEL RUBRO: no te quedes solo con variaciones de plural/singular de la frase que escribió el cliente -- el mismo producto se nombra de formas totalmente distintas y tenés que cubrirlas TODAS en el grupo, no solo la que usó él. Referencia (no es una lista cerrada, es un piso mínimo): generador eléctrico = generador de luz = generador de energia = planta eléctrica = grupo electrogeno. cortacésped = cortador de pasto = cortapasto = maquina cortapasto = cortadora de cesped. desmalezadora = bordeadora = desbrozadora = motoguadaña = orilladora. motobomba = bomba a combustion = bomba a nafta para agua = bomba a gasoil para agua. compresor = compresor de aire = motocompresor. Para CUALQUIER producto que no esté en esta lista, pensá igual en los nombres técnico, comercial y coloquial con los que un cliente paraguayo lo llamaría antes de armar el grupo -- nunca generes variantes que sean solo pequeños cambios de la frase original del cliente, eso no cuenta como cobertura real de sinónimos." }] },
        contents: [{ role: 'user', parts: [{ text: chatHistoryText }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.2, responseMimeType: "application/json" }
      }
    }));

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
  } catch (e) {
    console.error(JSON.stringify({ event: "intent_extraction_failed", error: (e as Error).message }));
  }
  return null;
}

// deno-lint-ignore no-explicit-any
export async function getEmbedding(text: string, supaAdmin: any): Promise<{ embedding: number[] | null; cacheHit: boolean }> {
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

  // Call Gemini API (con rotación automática de keys)
  try {
    const data = await fetchGeminiWithRotation(() => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`,
      body: {
        model: 'models/gemini-embedding-2',
        content: { parts: [{ text }] },
        outputDimensionality: 768,
        taskType: "RETRIEVAL_QUERY"
      }
    }));

    const embedding = data.embedding.values;
    supaAdmin.from('search_embeddings_cache').insert({ query_text: cacheKey, embedding }).then().catch(() => {});
    return { embedding, cacheHit: false };
  } catch (e) {
    console.error(JSON.stringify({ event: "embedding_failed", error: (e as Error).message }));
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

// Búsqueda de texto literal, usando todas las variantes/sinónimos de un mismo
// grupo de búsqueda (generadas por extractIntent). Sirve de red de seguridad cuando
// el embedding semántico no encuentra bien un producto, pero el texto sí coincide.
// Palabras vacías: si las dejáramos, un match por "de" o "para" haría que
// prácticamente cualquier producto del catálogo entre como candidato.
const STOPWORDS = new Set([
  'a', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'en', 'con', 'sin', 'para', 'por', 'que', 'al', 'su', 'sus'
]);

// Compuerta de relevancia real para los resultados de vectorSearch: el
// embedding puede traer candidatos que "suenan parecido" (ej. buscar
// "chaleco de seguridad" y traer un tablero eléctrico, porque el
// match_threshold de 0.45 es permisivo) sin compartir ni una palabra real
// con lo pedido. Como extractIntent ya genera 3-5 sinónimos por grupo
// justamente para cubrir variaciones de vocabulario, exigir que el
// candidato contenga al menos UNA palabra significativa de AL MENOS UNO de
// esos sinónimos filtra el ruido semántico puro sin exigir coincidencia
// literal exacta.
export function groupMatchesText(group: string[], text: string): boolean {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return group.some(phrase => {
    const words = phrase
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-záéíóúñ0-9.\/-]/gi, ''))
      .filter(w => w.length > 2 && !STOPWORDS.has(w));
    return words.some(w => lowerText.includes(w));
  });
}

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
          const clean = w.replace(/[^a-záéíóúñ0-9.\/-]/gi, '');
          // Los números sueltos (ej. el "10" de "10 A", el "40" de "40 amper")
          // casi siempre son una cantidad con una unidad que el usuario mencionó
          // (amperios, voltios, litros, PSI...), no un término de texto real que
          // vaya a aparecer igual en la ficha del producto (que usa otra unidad,
          // ej. kVA). Meterlo como término AND obligatorio filtra afuera productos
          // válidos que no tienen esa cifra exacta de casualidad en su descripción.
          // Sí dejamos pasar números que parecen modelo/medida de producto (con
          // formato tipo "22kva", "1.5", "3/4") porque esos no son ambiguos.
          const isBareNumber = /^[0-9]+(\.[0-9]+)?$/.test(clean);
          if (clean.length > 1 && !STOPWORDS.has(clean) && !isBareNumber) words.add(clean);
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
