import { fetchGeminiWithRotation } from "./gemini.ts";

// ─────────────────────────────────────────────────────────────────────────
// CONVERSIÓN DE UNIDADES — determinística, en código, NO en el LLM.
//
// Antes: le pedíamos al modelo (gemini-3.1-flash-lite) que hiciera la
// aritmética Y que "adivinara" el escenario más común (mono/trifásico,
// 220V/380V) para convertir, por ejemplo, amperios a kVA. Un modelo chico
// no es confiable para eso: terminaba generando variantes de generadores
// de 45-88 kVA trifásicos para un cliente que pedía electricidad para su
// CASA. El LLM es bueno reconociendo patrones de texto (qué número, qué
// unidad, qué categoría de producto), pero malo haciendo matemática y
// razonando sobre "qué escenario es típico" sin contexto explícito.
//
// Ahora: el LLM SOLO extrae { valor, unidad } tal cual los escribió el
// cliente (extracción de texto, su fuerte). Toda la conversión y la
// decisión mono/trifásico las hace este módulo con fórmulas reales y
// reglas de contexto explícitas y auditables.
// ─────────────────────────────────────────────────────────────────────────

type Quantity = { value: number; unit: string } | null;

type ParsedGroup = { terms: string[]; quantity: Quantity };

type ConversionContext = {
  isResidential: boolean;
  isIndustrial: boolean;
  explicitPhase: "mono" | "tri" | null;
  explicitVoltage: number | null;
};

function detectContext(chatHistoryText: string): ConversionContext {
  const lower = chatHistoryText.toLowerCase();

  const isResidential = /\b(casa|hogar|vivienda|domicilio|departamento|apartamento|mi casa)\b/.test(lower);
  const isIndustrial = /\b(f[aá]brica|industria|planta|empresa|comercio|negocio|galp[oó]n|local)\b/.test(lower);

  const explicitPhase = /\btrif[aá]sico\b/.test(lower)
    ? "tri"
    : /\bmonof[aá]sico\b/.test(lower)
    ? "mono"
    : null;

  // Detecta un voltaje mencionado explícitamente por el usuario (ej. "220v", "380 v")
  const voltMatch = lower.match(/(\d{3})\s*v\b/);
  const explicitVoltage = voltMatch ? parseInt(voltMatch[1], 10) : null;

  return { isResidential, isIndustrial, explicitPhase, explicitVoltage };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Eléctrico: amperios -> kVA. Genera variantes SOLO para las ramas que el
// contexto sugiere. Si no hay ninguna pista de contexto, usamos monofásico
// 220V como default (el caso más común: particular / uso doméstico),
// evitando el default anterior de "generar los 2-3 escenarios típicos"
// que terminaba metiendo trifásico donde no correspondía.
function ampsToKvaVariants(amps: number, ctx: ConversionContext): string[] {
  const variants: string[] = [];

  const wantsMono = ctx.explicitPhase === "mono" || (!ctx.explicitPhase && !ctx.isIndustrial);
  const wantsTri = ctx.explicitPhase === "tri" || ctx.isIndustrial;

  if (wantsMono) {
    const v = ctx.explicitVoltage && ctx.explicitVoltage < 300 ? ctx.explicitVoltage : 220;
    const kva = round1((v * amps) / 1000);
    variants.push(`generador ${kva} kva`, `generador ${Math.ceil(kva)} kva`);
  }

  if (wantsTri) {
    const v = ctx.explicitVoltage && ctx.explicitVoltage >= 300 ? ctx.explicitVoltage : 380;
    const kva = round1((Math.sqrt(3) * v * amps) / 1000);
    variants.push(`generador ${kva} kva trifasico`, `generador ${Math.ceil(kva)} kva trifasico`);
  }

  // Red de seguridad: si por alguna razón ninguna rama se activó, no dejamos
  // la búsqueda vacía -- default a monofásico 220V (caso más frecuente).
  if (variants.length === 0) {
    const kva = round1((220 * amps) / 1000);
    variants.push(`generador ${kva} kva`);
  }

  return variants;
}

function psiToBarVariants(psi: number): string[] {
  const bar = round1(psi / 14.5038);
  return [`compresor ${bar} bar`, `compresor ${Math.ceil(bar)} bar`];
}

function lbToKgVariants(lb: number): string[] {
  const kg = round1(lb / 2.20462);
  return [`${kg} kg`, `${Math.ceil(kg)} kg`];
}

function hpToKwVariants(hp: number): string[] {
  const kw = round1(hp * 0.7457);
  return [`motor ${kw} kw`, `motor ${Math.ceil(kw)} kw`];
}

// litros por minuto o pies cúbicos por minuto -> m3/h (caudal de bombas)
function lpmToM3hVariants(lpm: number): string[] {
  const m3h = round1((lpm * 60) / 1000);
  return [`bomba ${m3h} m3/h`, `bomba ${Math.ceil(m3h)} m3/h`];
}

function cfmToM3hVariants(cfm: number): string[] {
  const m3h = round1(cfm * 1.699);
  return [`bomba ${m3h} m3/h`, `compresor ${m3h} m3/h`];
}

// Detecta qué tipo de conversión aplica según la unidad que extrajo el LLM.
// Devuelve null si la unidad no es reconocida (no forzamos conversión).
function convertQuantity(qty: Quantity, ctx: ConversionContext): string[] {
  if (!qty) return [];
  const unit = qty.unit.toLowerCase().trim();
  const v = qty.value;

  if (/^(a|amp|amper|amperio|amperios|amps)$/.test(unit)) return ampsToKvaVariants(v, ctx);
  if (/^(psi|libra.?pulgada)$/.test(unit)) return psiToBarVariants(v);
  if (/^(lb|libra|libras)$/.test(unit)) return lbToKgVariants(v);
  if (/^(hp|caballo|caballos|caballo.?de.?fuerza)$/.test(unit)) return hpToKwVariants(v);
  if (/^(l\/min|lpm|litro.?por.?minuto|litros.?por.?minuto)$/.test(unit)) return lpmToM3hVariants(v);
  if (/^(cfm|pie.?c[uú]bico|pies.?c[uú]bicos)$/.test(unit)) return cfmToM3hVariants(v);

  return []; // unidad no reconocida: no inventamos nada, seguimos solo con los términos normales
}

// ─────────────────────────────────────────────────────────────────────────
// EXTRACCIÓN DE INTENCIÓN
// El LLM ahora SOLO hace lo que hace bien: reconocer categoría de producto,
// generar sinónimos/plurales, y extraer el número+unidad TAL CUAL los
// escribió el cliente (sin convertir nada). La conversión ocurre después,
// en convertQuantity(), con matemática real.
// ─────────────────────────────────────────────────────────────────────────
export async function extractIntent(chatHistoryText: string): Promise<string[][] | null> {
  try {
    const data = await fetchGeminiWithRotation(() => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`,
      body: {
        systemInstruction: {
          parts: [{
            text: "Eres el motor de búsqueda interno. Tu trabajo es leer el historial de chat y deducir EXACTAMENTE qué productos está buscando el usuario en su ÚLTIMO mensaje. ¡OJO CON EL HISTORIAL! Usa el historial solo para entender el contexto, pero NO MEZCLES características de productos anteriores con el nuevo pedido. Si pide una 'bomba' y un 'motor' en el MISMO mensaje, debes buscar ambos. REGLA DE ORO: Si el usuario escribe en PLURAL, INCLUYE obligatoriamente la versión en SINGULAR. IMPORTANTE SOBRE PEDIDOS MÚLTIPLES: Cada vez que detectes un producto DISTINTO solicitado, debes crearle un GRUPO independiente con sus propias 3 a 5 variantes y sinónimos. "
              + "REGLA DE ACCESORIOS SUELTOS: si el usuario pide un accesorio o repuesto suelto (arnés, correa, chaleco, funda, cable, etc.) PARA una máquina, generá el grupo enfocado en el accesorio en sí (ej. 'arnes', 'arnes de seguridad', 'chaleco reflectante') y NO repitas el nombre de la máquina en cada variante. CATEGORÍAS RELACIONADAS: algunos términos de máquinas se superponen mucho en la jerga del rubro sin ser exactamente lo mismo (ej. podadora, desmalezadora, bordeadora y motoguadaña son categorías cercanas que suelen confundirse). Cuando el pedido sea sobre un accesorio, repuesto, o la máquina en sí de una de estas categorías, agregá TAMBIÉN al mismo grupo las variantes de las categorías cercanas. SINÓNIMOS OBLIGATORIOS DEL RUBRO: no te quedes solo con variaciones de plural/singular de la frase que escribió el cliente. Referencia (no es una lista cerrada, es un piso mínimo): generador eléctrico = generador de luz = generador de energia = planta eléctrica = grupo electrogeno. cortacésped = cortador de pasto = cortapasto = maquina cortapasto = cortadora de cesped. desmalezadora = bordeadora = desbrozadora = motoguadaña = orilladora. motobomba = bomba a combustion = bomba a nafta para agua = bomba a gasoil para agua. compresor = compresor de aire = motocompresor. Para CUALQUIER producto que no esté en esta lista, pensá igual en los nombres técnico, comercial y coloquial con los que un cliente paraguayo lo llamaría antes de armar el grupo. "
              + "REGLA DE UNIDADES (MUY IMPORTANTE): Si el usuario menciona una cantidad con unidad de medida (amperios, PSI, libras, litros por minuto, pies cúbicos, caballos de fuerza, kVA, kW, bar, kg, m3/h, o cualquier otra), tenés PROHIBIDO convertirla vos mismo. Tu único trabajo con eso es reportarla TAL CUAL la escribió el cliente en el campo 'quantity' del grupo correspondiente (value: número, unit: la unidad tal cual la escribió, ej. 'amperios', 'psi', 'hp'). La conversión matemática la hace otro sistema después. NO agregues variantes de búsqueda ya convertidas a otra unidad -- eso ya no es tu trabajo. "
              + "Responde ÚNICAMENTE con un array JSON de objetos, cada uno con 'terms' (array de strings con sinónimos/variantes de búsqueda, SIN conversiones de unidad) y 'quantity' (objeto {value, unit} tal cual lo escribió el cliente, o null si no mencionó ninguna cantidad con unidad). "
              + "Ejemplo para 1 producto sin cantidad: [{\"terms\":[\"panel solar\",\"paneles solares\"],\"quantity\":null}]. "
              + "Ejemplo con cantidad (generador por amperios): pedido 'generador de 50 A para mi casa' -> [{\"terms\":[\"generador\",\"generadores\",\"grupo electrogeno\",\"planta electrica\"],\"quantity\":{\"value\":50,\"unit\":\"amperios\"}}]. "
              + "Ejemplo con cantidad (compresor por PSI): pedido 'compresor de 90 psi' -> [{\"terms\":[\"compresor\",\"compresores\",\"compresor de aire\"],\"quantity\":{\"value\":90,\"unit\":\"psi\"}}]. "
              + "Ejemplo con 2 productos distintos a la vez: [{\"terms\":[\"bomba de agua\",\"bombas de agua\"],\"quantity\":null},{\"terms\":[\"motor electrico\",\"motores electricos\"],\"quantity\":null}]."
          }]
        },
        contents: [{ role: "user", parts: [{ text: chatHistoryText }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.2, responseMimeType: "application/json" }
      }
    }));

    if (data.candidates?.[0]?.content?.parts) {
      const text = data.candidates[0].content.parts[0].text.trim();
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0) return null;

        const ctx = detectContext(chatHistoryText);

        // deno-lint-ignore no-explicit-any
        const groups: ParsedGroup[] = (parsed as any[]).map((g) => {
          // Compat: si el modelo devolviera un array plano de strings (formato viejo)
          // o un string suelto, lo normalizamos igual sin romper.
          if (Array.isArray(g)) return { terms: g.filter(Boolean), quantity: null };
          if (typeof g === "string") return { terms: [g], quantity: null };
          return {
            terms: Array.isArray(g?.terms) ? g.terms.filter(Boolean) : [],
            quantity: g?.quantity && typeof g.quantity.value === "number" && typeof g.quantity.unit === "string"
              ? { value: g.quantity.value, unit: g.quantity.unit }
              : null,
          };
        });

        // Acá es donde se hace la conversión REAL, con fórmulas y no con
        // "buen criterio" de un modelo chico.
        return groups.map((g) => {
          const convertedVariants = convertQuantity(g.quantity, ctx);
          const merged = [...new Set([...g.terms, ...convertedVariants])];
          return merged;
        });
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
