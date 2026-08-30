import { fetchGeminiWithRotation } from "./gemini.ts";

// ─────────────────────────────────────────────────────────────────────────
// CONVERSIÓN DE UNIDADES — determinística, en código, NO en el LLM.
// (ver historial de cambios: antes el LLM adivinaba mono/trifásico y hacía
// la aritmética él mismo -- ahora solo extrae {value, unit} tal cual lo
// escribió el cliente, y acá abajo se calcula todo con fórmulas reales).
//
// v2: además de generar las variantes de texto para buscar, exponemos el
// "target" (el número + unidad ya convertidos, ej. {value: 11, unit: "kva"})
// como dato estructurado. Esto es necesario para dos cosas que en v1 no
// pasaban:
//   1. keywordSearch ya NO descarta este número como si fuera el crudo del
//      cliente (ver REGLA_UNIDAD_CONVERTIDA más abajo).
//   2. index.ts puede pasarle el target explícito al LLM asesor final y
//      ordenar/filtrar candidatos por cercanía real a ese número, en vez de
//      dejar que el modelo elija "a ojo" entre productos de tamaños muy
//      distintos sin saber cuál es el objetivo.
// ─────────────────────────────────────────────────────────────────────────

type Quantity = { value: number; unit: string } | null;

export type Target = { value: number; unit: "kva" | "bar" | "kg" | "kw" | "m3h" } | null;

type ParsedGroup = { terms: string[]; quantity: Quantity };

export type IntentGroup = { terms: string[]; target: Target };

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

  const voltMatch = lower.match(/(\d{3})\s*v\b/);
  const explicitVoltage = voltMatch ? parseInt(voltMatch[1], 10) : null;

  return { isResidential, isIndustrial, explicitPhase, explicitVoltage };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Cada convertidor devuelve tanto las variantes de texto (para la búsqueda
// de palabras) como UN target numérico principal (para el filtro/orden por
// cercanía en index.ts). Cuando hay más de una rama posible (mono/tri),
// el target apunta a la rama que el contexto indicó como más probable --
// las otras ramas quedan como variantes de texto nomás, no como target
// "oficial" (evita mandar dos objetivos contradictorios a index.ts).
function ampsToKva(amps: number, ctx: ConversionContext): { variants: string[]; target: Target } {
  const variants: string[] = [];
  let target: Target = null;

  const wantsMono = ctx.explicitPhase === "mono" || (!ctx.explicitPhase && !ctx.isIndustrial);
  const wantsTri = ctx.explicitPhase === "tri" || ctx.isIndustrial;

  if (wantsMono) {
    const v = ctx.explicitVoltage && ctx.explicitVoltage < 300 ? ctx.explicitVoltage : 220;
    const kva = round1((v * amps) / 1000);
    variants.push(`generador ${kva} kva`, `generador ${Math.ceil(kva)} kva`);
    if (!target) target = { value: kva, unit: "kva" };
  }

  if (wantsTri) {
    const v = ctx.explicitVoltage && ctx.explicitVoltage >= 300 ? ctx.explicitVoltage : 380;
    const kva = round1((Math.sqrt(3) * v * amps) / 1000);
    variants.push(`generador ${kva} kva trifasico`, `generador ${Math.ceil(kva)} kva trifasico`);
    if (!target || ctx.explicitPhase === "tri") target = { value: kva, unit: "kva" };
  }

  if (variants.length === 0) {
    const kva = round1((220 * amps) / 1000);
    variants.push(`generador ${kva} kva`);
    target = { value: kva, unit: "kva" };
  }

  return { variants, target };
}

function psiToBar(psi: number): { variants: string[]; target: Target } {
  const bar = round1(psi / 14.5038);
  return { variants: [`compresor ${bar} bar`, `compresor ${Math.ceil(bar)} bar`], target: { value: bar, unit: "bar" } };
}

function lbToKg(lb: number): { variants: string[]; target: Target } {
  const kg = round1(lb / 2.20462);
  return { variants: [`${kg} kg`, `${Math.ceil(kg)} kg`], target: { value: kg, unit: "kg" } };
}

function hpToKw(hp: number): { variants: string[]; target: Target } {
  const kw = round1(hp * 0.7457);
  return { variants: [`motor ${kw} kw`, `motor ${Math.ceil(kw)} kw`], target: { value: kw, unit: "kw" } };
}

function lpmToM3h(lpm: number): { variants: string[]; target: Target } {
  const m3h = round1((lpm * 60) / 1000);
  return { variants: [`bomba ${m3h} m3/h`, `bomba ${Math.ceil(m3h)} m3/h`], target: { value: m3h, unit: "m3h" } };
}

function cfmToM3h(cfm: number): { variants: string[]; target: Target } {
  const m3h = round1(cfm * 1.699);
  return { variants: [`bomba ${m3h} m3/h`, `compresor ${m3h} m3/h`], target: { value: m3h, unit: "m3h" } };
}

function convertQuantity(qty: Quantity, ctx: ConversionContext): { variants: string[]; target: Target } {
  if (!qty) return { variants: [], target: null };
  const unit = qty.unit.toLowerCase().trim();
  const v = qty.value;

  if (/^(a|amp|amper|amperio|amperios|amps)$/.test(unit)) return ampsToKva(v, ctx);
  if (/^(psi|libra.?pulgada)$/.test(unit)) return psiToBar(v);
  if (/^(lb|libra|libras)$/.test(unit)) return lbToKg(v);
  if (/^(hp|caballo|caballos|caballo.?de.?fuerza)$/.test(unit)) return hpToKw(v);
  if (/^(l\/min|lpm|litro.?por.?minuto|litros.?por.?minuto)$/.test(unit)) return lpmToM3h(v);
  if (/^(cfm|pie.?c[uú]bico|pies.?c[uú]bicos)$/.test(unit)) return cfmToM3h(v);

  return { variants: [], target: null };
}

export async function extractIntent(chatHistoryText: string): Promise<IntentGroup[] | null> {
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
          if (Array.isArray(g)) return { terms: g.filter(Boolean), quantity: null };
          if (typeof g === "string") return { terms: [g], quantity: null };
          return {
            terms: Array.isArray(g?.terms) ? g.terms.filter(Boolean) : [],
            quantity: g?.quantity && typeof g.quantity.value === "number" && typeof g.quantity.unit === "string"
              ? { value: g.quantity.value, unit: g.quantity.unit }
              : null,
          };
        });

        return groups.map((g): IntentGroup => {
          const { variants, target } = convertQuantity(g.quantity, ctx);
          const terms = [...new Set([...g.terms, ...variants])];
          return { terms, target };
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

const STOPWORDS = new Set([
  'a', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'en', 'con', 'sin', 'para', 'por', 'que', 'al', 'su', 'sus'
]);

// Unidades del catálogo que, si aparecen PEGADAS a un número dentro de la
// misma frase (ej. "11 kva", "6.2 bar"), confirman que ese número es una
// especificación real y no una cantidad cruda del cliente (como el "50" de
// "50 A", que sí seguimos excluyendo). Esto es lo que faltaba: v1 tiraba
// CUALQUIER número suelto, incluido el que nosotros mismos convertimos.
const CATALOG_UNIT_TOKENS = new Set(['kva', 'kw', 'bar', 'kg', 'hp', 'm3/h', 'm3h']);

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
    const andGroups: string[] = [];

    phrases.slice(0, 4).forEach(phrase => {
      const rawWords = phrase.trim().toLowerCase().split(/\s+/);
      const words = new Set<string>();

      rawWords.forEach((w, i) => {
        const clean = w.replace(/[^a-záéíóúñ0-9.\/-]/gi, '');
        const isBareNumber = /^[0-9]+(\.[0-9]+)?$/.test(clean);

        if (isBareNumber) {
          // REGLA_UNIDAD_CONVERTIDA: si el número está pegado (antes o
          // después) a una unidad reconocida del catálogo (ej. "11 kva"),
          // NO es la cantidad cruda ambigua del cliente -- es un valor que
          // NUESTRO propio código ya convirtió a la unidad del catálogo
          // (ver search.ts / convertQuantity). Ese sí lo dejamos pasar.
          const neighbor = (rawWords[i - 1] || '').replace(/[^a-z0-9./]/gi, '') || (rawWords[i + 1] || '').replace(/[^a-z0-9./]/gi, '');
          if (CATALOG_UNIT_TOKENS.has(neighbor)) {
            words.add(clean);
          }
          return; // número crudo sin unidad de catálogo al lado: se sigue descartando, como antes
        }

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
