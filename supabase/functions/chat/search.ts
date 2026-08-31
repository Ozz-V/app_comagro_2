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

export type Target = { value: number; unit: "kva" | "bar" | "kg" | "kw" | "m3h"; estimated?: boolean; sizeBias?: "closest" | "smallest" } | null;

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

  const isResidential = /\b(casa|hogar|vivienda|domicilio|departamento|apartamento|residencia|residencial|morada|mi casa)\b/.test(lower);
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

// Detecta si un grupo de términos es sobre generadores (para poder asignar
// una estimación por defecto cuando el cliente no da ningún número --
// ver ESTIMACIÓN_RESIDENCIAL_POR_DEFECTO más abajo).
function isGeneratorGroup(terms: string[]): boolean {
  return terms.some(t => /generador|planta el[eé]ctrica|grupo electr[oó]geno/i.test(t));
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

  // PASS-THROUGH: si el cliente ya dio el número en la unidad nativa del
  // catálogo (kva, kw, bar, kg, m3/h), no hay ninguna conversión que hacer.
  // Esto faltaba: sin este caso, "generador de 6 kva" no generaba NINGÚN
  // target ni variante con el número, y la búsqueda quedaba igual de
  // genérica que si el cliente no hubiera dado ninguna cifra.
  if (/^kva$/.test(unit)) {
    return { variants: [`generador ${v} kva`, `generador ${Math.ceil(v)} kva`], target: { value: v, unit: "kva" } };
  }
  if (/^kw$/.test(unit)) {
    return { variants: [`${v} kw`, `${Math.ceil(v)} kw`], target: { value: v, unit: "kw" } };
  }
  if (/^bar$/.test(unit)) {
    return { variants: [`${v} bar`, `${Math.ceil(v)} bar`], target: { value: v, unit: "bar" } };
  }
  if (/^kg$/.test(unit)) {
    return { variants: [`${v} kg`, `${Math.ceil(v)} kg`], target: { value: v, unit: "kg" } };
  }
  if (/^(m3\/h|m3h)$/.test(unit)) {
    return { variants: [`bomba ${v} m3/h`, `bomba ${Math.ceil(v)} m3/h`], target: { value: v, unit: "m3h" } };
  }

  if (/^(a|amp|amper|amperio|amperios|amps)$/.test(unit)) return ampsToKva(v, ctx);
  if (/^(psi|libra.?pulgada)$/.test(unit)) return psiToBar(v);
  if (/^(lb|libra|libras)$/.test(unit)) return lbToKg(v);
  if (/^(hp|caballo|caballos|caballo.?de.?fuerza)$/.test(unit)) return hpToKw(v);
  if (/^(l\/min|lpm|litro.?por.?minuto|litros.?por.?minuto)$/.test(unit)) return lpmToM3h(v);
  if (/^(cfm|pie.?c[uú]bico|pies.?c[uú]bicos)$/.test(unit)) return cfmToM3h(v);

  return { variants: [], target: null };
}

// Cache en memoria de la lista real de "Tipo de Producto" del catálogo.
// Se mantiene al día automáticamente cuando se cargan productos nuevos --
// sin tocar código ni prompts.
let productTypesCache: { list: string[]; fetchedAt: number } | null = null;
const PRODUCT_TYPES_TTL_MS = 60 * 60 * 1000; // 1h -- el catálogo no cambia tan seguido

// deno-lint-ignore no-explicit-any
async function refreshProductTypes(supaAdmin: any): Promise<string[]> {
  try {
    const { data, error } = await supaAdmin.rpc('obtener_tipos_producto');
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    const list = (data || []).map((r: any) => r.tipo).filter(Boolean);
    productTypesCache = { list, fetchedAt: Date.now() };
    return list;
  } catch (e) {
    console.error(JSON.stringify({ event: "product_types_fetch_failed", error: String(e) }));
    return productTypesCache?.list || [];
  }
}

// STALE-WHILE-REVALIDATE: si ya hay algo en cache (aunque esté vencido),
// lo devolvemos AL INSTANTE y refrescamos en segundo plano sin que el
// cliente espere -- antes, cuando el cache vencía (cada 30 min), el
// mensaje del chat se quedaba esperando el RPC completo antes de poder
// arrancar, sumando latencia real al tiempo de respuesta. Ahora solo se
// bloquea la primera vez que la función arranca en frío (cache
// completamente vacío), que es inevitable.
// deno-lint-ignore no-explicit-any
export async function getProductTypes(supaAdmin: any): Promise<string[]> {
  const now = Date.now();
  if (productTypesCache) {
    if ((now - productTypesCache.fetchedAt) >= PRODUCT_TYPES_TTL_MS) {
      refreshProductTypes(supaAdmin).catch(() => {}); // fire-and-forget
    }
    return productTypesCache.list;
  }
  return await refreshProductTypes(supaAdmin);
}

export async function extractIntent(chatHistoryText: string, productTypes: string[]): Promise<IntentGroup[] | null> {
  try {
    const data = await fetchGeminiWithRotation(() => ({
      // OPTIMIZACIÓN: Subimos a gemini-3.1-flash (sin "lite") para esta tarea. 
      // El modelo lite se confundía con la lista de categorías tan larga y fallaba
      // asociando jergas como "sapito" a "bomba vibratoria".
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash:generateContent`,
      body: {
        systemInstruction: {
          parts: [{
            text: "Eres el motor de búsqueda interno. Tu trabajo es leer el historial de chat y deducir EXACTAMENTE qué productos está buscando el usuario en su ÚLTIMO mensaje. ¡OJO CON EL HISTORIAL! Usa el historial solo para entender el contexto, pero NO MEZCLES características de productos anteriores con el nuevo pedido. Si pide una 'bomba' y un 'motor' en el MISMO mensaje, debes buscar ambos. REGLA DE ORO: Si el usuario escribe en PLURAL, INCLUYE obligatoriamente la versión en SINGULAR. IMPORTANTE SOBRE PEDIDOS MÚLTIPLES: Cada vez que detectes un producto DISTINTO solicitado, debes crearle un GRUPO independiente con sus propias 3 a 5 variantes y sinónimos. "
              + `REGLA DE JERGA LOCAL (PARAGUAY): Los usuarios a menudo usan jerga. Por ejemplo, si piden "sapito", se refieren a una BOMBA VIBRATORIA. Si piden "bomba loca", es una BOMBA DE ACHIQUE. Traduce estas jergas a su nombre técnico real antes de elegir la categoría. `
              + `REGLA DE CATEGORÍA REAL (LA MÁS IMPORTANTE DE TODAS): esta es la lista COMPLETA y REAL de valores de 'Tipo de Producto' que existen ahora mismo en nuestro catálogo -- no es una lista de ejemplos, es el vocabulario oficial y no hay otras categorías fuera de esta lista: ${productTypes.join(' | ')}. Tu trabajo es, usando sentido común general de ferretería/agro (no necesitás que te dé ejemplos caso por caso), identificar cuál o cuáles de ESTAS categorías reales resuelve lo que pide el cliente -- incluso si lo cuenta como una necesidad y no nombra el producto (ej. si pide algo para "hacer hoyos y poner postes", buscá en la lista cuál categoría real corresponde a eso). Si el pedido podría resolverse razonablemente con más de una categoría real de la lista, generá un grupo separado por cada una (no elijas una sola a ciegas). NUNCA inventes ni uses una categoría que no esté literalmente en esta lista. Para cada grupo, el primer término de 'terms' debe ser el nombre EXACTO de la categoría elegida tal como aparece en la lista, seguido de sinónimos/plurales/variantes coloquiales de esa palabra que un cliente paraguayo usaría. `
              + `REGLA DE SUBTIPOS DEL MISMO OBJETO: en la lista real vas a encontrar casos donde el mismo objeto tiene varias categorías separadas por subtipo/variante (ej. "PANEL SOLAR BIFACIAL" y "PANEL SOLAR MONOCRISTALINO" son ambas variantes de panel solar; "BOMBA DE AGUA" y "MOTOBOMBA" podrían convivir como categorías separadas). Si el cliente pidió el objeto en general SIN especificar la variante/subtipo (ej. "un panel solar" sin decir bifacial o monocristalino), incluí TODAS las categorías reales de la lista que sean subtipos de ese mismo objeto como términos del MISMO grupo (no elijas una sola variante a ciegas y no generes grupos separados por subtipo tampoco, van todas juntas en un solo grupo). Si el cliente sí especificó la variante, priorizá esa categoría real puntual. `
              + `REGLA DE ACCESORIO/REPUESTO PARA UNA MÁQUINA ESPECÍFICA: en la lista de categorías reales vas a encontrar variantes con calificador, tipo "REPUESTOS PARA X", "ACCESORIOS PARA X", "ATS PARA X". Si el cliente pide explícitamente un repuesto, accesorio, pieza o ATS (con esas palabras o similares) PARA una máquina puntual que nombró, elegí la categoría real con calificador que corresponda (ej. "REPUESTOS PARA GENERADOR") en vez de la categoría de la máquina completa. Si el cliente NO usó ninguna palabra de accesorio/repuesto (solo describió una necesidad o pidió la máquina en sí), NUNCA elijas una categoría con calificador "PARA X" -- elegí la categoría de la máquina completa. Si pide el accesorio suelto sin nombrar ninguna máquina (ej. "necesito un arnés" a secas), buscá en la lista real cuál categoría con calificador podría aplicar, sin asumir una máquina específica. `
              + `REGLA DE UNIDADES (MUY IMPORTANTE): Si el usuario menciona una cantidad con unidad de medida (amperios, PSI, libras, litros por minuto, pies cúbicos, caballos de fuerza, kVA, kW, bar, kg, m3/h, o cualquier otra), tenés PROHIBIDO convertirla vos mismo. Tu único trabajo con eso es reportarla TAL CUAL la escribió el cliente en el campo 'quantity' del grupo correspondiente (value: número, unit: la unidad tal cual la escribió, ej. 'amperios', 'psi', 'hp'). La conversión matemática la hace otro sistema después. NO agregues variantes de búsqueda ya convertidas a otra unidad -- eso ya no es tu trabajo. `
              + "Responde ÚNICAMENTE con un array JSON de objetos, cada uno con 'terms' (array de strings con sinónimos/variantes de búsqueda, SIN conversiones de unidad) y 'quantity' (objeto {value, unit} tal cual lo escribió el cliente, o null si no mencionó ninguna cantidad con unidad). "
              + "Ejemplo para 1 producto sin cantidad: [{\"terms\":[\"panel solar\",\"paneles solares\"],\"quantity\":null}]. "
              + "Ejemplo con cantidad (generador por amperios): pedido 'generador de 50 A para mi casa' -> [{\"terms\":[\"generador\",\"generadores\",\"grupo electrogeno\",\"planta electrica\"],\"quantity\":{\"value\":50,\"unit\":\"amperios\"}}]. "
              + "Ejemplo con cantidad (compresor por PSI): pedido 'compresor de 90 psi' -> [{\"terms\":[\"compresor\",\"compresores\",\"compresor de aire\"],\"quantity\":{\"value\":90,\"unit\":\"psi\"}}]. "
              + "Ejemplo con 2 productos distintos a la vez: [{\"terms\":[\"bomba de agua\",\"bombas de agua\"],\"quantity\":null},{\"terms\":[\"motor electrico\",\"motores electricos\"],\"quantity\":null}]."
          }]
        },
        contents: [{ role: "user", parts: [{ text: chatHistoryText }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.2, responseMimeType: "application/json" }
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
          const { variants, target: convertedTarget } = convertQuantity(g.quantity, ctx);
          let target = convertedTarget;
          let terms = [...new Set([...g.terms, ...variants])];

          // TARGET_POR_DEFECTO: si el cliente pide un generador SIN dar
          // ningún número, nunca dejamos target en null ni le preguntamos
          // nada -- se le asigna una estimación (residencial ~20kVA, o
          // "priorizar el más chico" si no hay ni siquiera contexto de
          // casa/fábrica) para que el filtro de cercanía en index.ts tenga
          // con qué trabajar. Esto es lo que faltaba: sin esto, el filtro
          // nunca se activaba sin cifra, y la búsqueda quedaba "sin timón"
          // mostrando lo primero que trajera la base de datos (que resultó
          // ser siempre los mismos generadores industriales).
          // NUNCA se le pregunta al cliente por su consumo -- siempre se le
          // asigna un objetivo (real, estimado, o "priorizar el más chico")
          // para que el filtro de cercanía de index.ts tenga con qué
          // trabajar y la recomendación salga directa, sin rebotarle una
          // pregunta.
          if (!target && !ctx.isIndustrial && isGeneratorGroup(g.terms)) {
            if (ctx.isResidential) {
              // Pidió para "casa/hogar/vivienda/residencia" pero sin dar
              // ningún número -- una casa normal ronda 15-25 kVA, se estima
              // el centro de ese rango (20 kVA) directo, sin preguntar nada.
              target = { value: 20, unit: "kva", estimated: true, sizeBias: "closest" };
              terms = [...new Set([...terms, "generador 20 kva", "generador 18 kva", "generador 22 kva", "generador 25 kva", "generador 15 kva"])];
            } else {
              // Pedido totalmente genérico ("quiero un generador" a secas,
              // sin casa/hogar ni fábrica/industria): en vez de preguntar,
              // se prioriza la opción de MENOR potencia disponible como
              // recomendación principal (la más accesible), y se deja que
              // el prompt final mencione la de mayor potencia solo como
              // referencia de lo que existe en el otro extremo.
              target = { value: 0, unit: "kva", estimated: true, sizeBias: "smallest" };
            }
          }

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
      supabase.rpc('buscar_productos_ia', { query_embedding: queryEmbedding, match_threshold: 0.45, match_count: 40 }),
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
      // Antes en 12: con un pedido genérico ("generador" a secas, sin
      // número), esta consulta matchea decenas de productos y, al no tener
      // ORDER BY, Postgres corta arbitrariamente en los primeros 12 que
      // encuentra -- que resultaron ser siempre los mismos industriales.
      // Las opciones chicas ni siquiera llegaban a esta lista para que el
      // filtro de cercanía en index.ts pudiera rescatarlas. Se sube el
      // límite para traer un pool más completo y dejar que el ordenamiento
      // por especificación real (en index.ts) haga el trabajo de elegir.
      .limit(40);

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
