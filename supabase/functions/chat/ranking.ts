// ─────────────────────────────────────────────────────────────────────────
// ranking.ts
//
// Lógica determinística de scoring, filtrado y diversidad de candidatos de
// producto. Extraído de chat/index.ts (P1-1) para que sea testeable sin
// tener que levantar toda la edge function (sin red, sin Supabase, sin
// Gemini) — son funciones puras que reciben datos y devuelven datos.
//
// IMPORTANTE: esta extracción es 1:1 con el comportamiento anterior. No se
// cambió ninguna regla de negocio, solo se movió el código y se le agregaron
// nombres/parámetros explícitos donde antes eran variables locales del
// handler. Si algo necesita cambiar de comportamiento, hacerlo en un commit
// aparte del de la extracción, para poder revisar cada uno por separado.
// ─────────────────────────────────────────────────────────────────────────

import type { Target } from "./search.ts";

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Extrae el campo estructurado "Tipo de Producto" del bloque de
// especificaciones técnicas dentro de sales_pitch (viene generado a partir
// de los datos reales del catálogo/Plytix, ej. "**Tipo de Producto:**
// GENERADOR" o "**Tipo de Producto:** ATS PARA GENERADOR"). Es un dato
// estructurado y confiable -- a diferencia de intentar adivinar la
// categoría leyendo palabras sueltas en toda la descripción libre.
export function extractProductType(text: string): string | null {
  if (!text) return null;
  const m = text.match(/\*\*Tipo de Producto:\*\*\s*([^\n*]+)/i);
  return m ? m[1].trim() : null;
}

// Extrae el campo estructurado "Marca" del bloque de especificaciones
// técnicas dentro de sales_pitch, con el mismo criterio que
// extractProductType (mismo pipeline de generación del catálogo/Plytix,
// donde "Marca" es un atributo estándar junto a "Tipo de Producto"). Si el
// campo estructurado no está presente en algún registro viejo, se prueba
// una segunda variante de etiqueta ("Fabricante") antes de rendirse.
export function extractBrand(text: string): string | null {
  if (!text) return null;
  const m = text.match(/\*\*Marca:\*\*\s*([^\n*]+)/i) || text.match(/\*\*Fabricante:\*\*\s*([^\n*]+)/i) || text.match(/\*\*Brand:\*\*\s*([^\n*]+)/i);
  return m ? m[1].trim() : null;
}

// Reordena un grupo de candidatos ya ordenados por relevancia/cercanía para
// que, si hay más de una marca presente, se intercalen en round-robin
// (1ro de marca A, 1ro de marca B, 2do de marca A, 2do de marca B, ...) en
// vez de dejar que la relevancia textual cruda apile todos los de una sola
// marca al principio. Se preserva el orden relativo DENTRO de cada marca.
// Si solo hay una marca (o ninguna detectable), devuelve la lista intacta.
// deno-lint-ignore no-explicit-any
export function diversifyByBrand(items: any[]): any[] {
  // deno-lint-ignore no-explicit-any
  const buckets = new Map<string, any[]>();
  const brandOrder: string[] = [];
  for (const item of items) {
    const brand = extractBrand(item.sales_pitch || '') || '__sin_marca_detectada__';
    if (!buckets.has(brand)) { buckets.set(brand, []); brandOrder.push(brand); }
    buckets.get(brand)!.push(item);
  }
  if (brandOrder.length <= 1) return items;

  // deno-lint-ignore no-explicit-any
  const result: any[] = [];
  let addedAny = true;
  while (addedAny) {
    addedAny = false;
    for (const brand of brandOrder) {
      const bucket = buckets.get(brand)!;
      if (bucket.length > 0) {
        result.push(bucket.shift());
        addedAny = true;
      }
    }
  }
  return result;
}

// Normaliza una palabra para comparar sin acentos, mayúsculas ni plural
// simple (ej. "Generadores" y "generador" deben compararse iguales).
export function normalizeWord(s: string): string {
  const clean = s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (clean.endsWith('es')) return clean.slice(0, -2);
  if (clean.endsWith('s')) return clean.slice(0, -1);
  return clean;
}

export function extractSpecValue(text: string, unit: NonNullable<Target>["unit"]): number | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  if (unit === "kva" || unit === "kw") {
    // Muchas fichas de generadores expresan la potencia en Watts sueltos
    // (ej. "9000W") en vez de kVA -- para esta escala son prácticamente
    // equivalentes (factor de potencia ~1), así que probamos ambos
    // patrones: primero VA/kVA (o W/kW), y si no aparece, el otro.
    const primarySuffix = unit === "kva" ? "va" : "w";
    const fallbackSuffix = unit === "kva" ? "w" : "va";
    const primaryRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*k?${primarySuffix}\\b`, "i");
    const fallbackRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*k?${fallbackSuffix}\\b`, "i");
    const m = lower.match(primaryRe) || lower.match(fallbackRe);
    if (m) {
      const val = parseFloat(m[1]);
      // Si el número es muy grande, probablemente está expresado en VA/W
      // sueltos (ej. "9000 W") en vez de kVA/kW -- normalizamos.
      return val > 1000 ? val / 1000 : val;
    }
    // FIX 2026-08-30: la mayoría de motores/bombas del catálogo expresan
    // la potencia SOLO en HP (ej. "Motor Eléctrico 5.5 HP"), sin mencionar
    // kW/kVA en ningún lado del texto. Se admite HP como unidad del texto
    // y se convierte a kW con el mismo factor que usa hpToKw() en la
    // extracción de intención (0.7457). Acepta coma decimal ("5,5 hp").
    const hpMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*hp\b/i);
    if (hpMatch) {
      const hp = parseFloat(hpMatch[1].replace(',', '.'));
      return round1(hp * 0.7457);
    }
    return null;
  }
  if (unit === "bar") {
    const m = lower.match(/(\d+(?:\.\d+)?)\s*bar\b/);
    return m ? parseFloat(m[1]) : null;
  }
  if (unit === "kg") {
    const m = lower.match(/(\d+(?:\.\d+)?)\s*kg\b/);
    return m ? parseFloat(m[1]) : null;
  }
  if (unit === "m3h" || unit === "m3/h") {
    const m = lower.match(/(\d+(?:\.\d+)?)\s*m3\/?h\b/);
    return m ? parseFloat(m[1]) : null;
  }
  return null;
}

const STOPWORDS_CAT = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'en', 'con', 'para', 'por', 'que', 'al']);

// groupCategoryWords: set de palabras "válidas" para el filtro de Tipo de
// Producto, derivado de TODOS los sinónimos que ya generó extractIntent
// para ese grupo -- no solo el primer término.
export function buildGroupCategoryWords(queryGroups: string[][]): Set<string>[] {
  return queryGroups.map(g =>
    new Set(
      g.flatMap(t => t.split(/\s+/).map(w => normalizeWord(w)))
        .filter(w => w.length > 2 && !STOPWORDS_CAT.has(w))
    )
  );
}

// blockSubmersible: si el cliente pidió "motor" a secas (sin ningún
// contexto de agua/pozo/bomba), se descartan candidatos "sumergibles" --
// evita ofrecer un motor sumergible de bomba cuando se pidió un motor
// eléctrico genérico.
export function detectBlockSubmersible(lastMessage: string): boolean {
  const isMotorQuery = /\bmotor(es)?\b/i.test(lastMessage);
  const hasWaterContext = /\b(agua|pozo|bomba|bombeo|sumergible)\b/i.test(lastMessage);
  return isMotorQuery && !hasWaterContext;
}

const ACCESSORY_REGEX = /\b(repuest|accesori|pieza|parte|impulsor|filtro|bujia|carburador|cable|aceite|arnes|arn[eé]s|chaleco|correa|funda|cintur[oó]n|ats\b|tablero de transferencia|panel de transferencia|transferencia automatica)\b/i;

// Contexto de reparación/rotura: única otra señal válida para permitir
// repuestos/accesorios sin que el cliente use la palabra literal
// "repuesto" o "accesorio" (ej. "se dañó mi podadora y quiero repararla").
const REPAIR_CONTEXT_REGEX = /\b(dañ[oó]|dañad[oa]|se\s+da[ñn]|romp[ií][oó]|se\s+rompi[oó]|rot[oa]|averiad[oa]|aver[ií]a|malogr[oó]|se\s+malogr|repar(ar|aci[oó]n|ando)?|arregl(ar|o)?|cambiar\s+(la|el|un|una)|reemplaz(ar|o)|no\s+(arranca|enciende|funciona|prende)|dej[oó]\s+de\s+funcionar|se\s+quem[oó]|quemad[oa]|falla(ndo)?|se\s+desgast)\b/i;

// isAccessoryRequest: true SOLO en dos casos legítimos --
//   (1) el cliente pidió explícitamente un repuesto/accesorio/pieza, o
//   (2) el contexto es claramente de reparación/rotura.
// Chequea TANTO el mensaje crudo COMO los queryGroups generados por la IA.
export function detectAccessoryRequest(params: {
  lastMessage: string;
  chatHistoryText: string;
  queryGroups: string[][];
}): boolean {
  const { lastMessage, chatHistoryText, queryGroups } = params;
  return ACCESSORY_REGEX.test(lastMessage)
    || REPAIR_CONTEXT_REGEX.test(chatHistoryText)
    || queryGroups.some(g => g.some(term => ACCESSORY_REGEX.test(term)));
}

// Dedupe por SKU + filtros duros: descarta SKUs de test/borrado, motores
// sumergibles cuando no corresponde, y (salvo pedido explícito de
// repuesto/accesorio) cualquier candidato cuyo Tipo de Producto real sea
// un repuesto/accesorio/ATS.
export function dedupeAndFilterContext(params: {
  // deno-lint-ignore no-explicit-any
  combinedContext: any[];
  blockSubmersible: boolean;
  isAccessoryRequest: boolean;
  // deno-lint-ignore no-explicit-any
}): any[] {
  const { combinedContext, blockSubmersible, isAccessoryRequest } = params;
  const seenSkus = new Set();
  // deno-lint-ignore no-explicit-any
  return combinedContext.filter((item: any) => {
    if (seenSkus.has(item.sku)) return false;
    if (/^TEST-|-DELETE-ME$/i.test(item.sku || '')) return false;
    if (blockSubmersible && item.sales_pitch?.toLowerCase().includes('sumergible')) return false;

    if (!isAccessoryRequest) {
      const tipoReal = extractProductType(item.sales_pitch || '') || '';
      const tipoUpper = tipoReal.toUpperCase();
      if (tipoUpper.includes('REPUESTO') || tipoUpper.includes('ACCESORIO') || tipoUpper.includes('ATS PARA')) {
        return false;
      }
    }

    seenSkus.add(item.sku);
    return true;
  });
}

// Anota cada candidato con __specNote (texto para el prompt), __ratio
// (spec/objetivo, para debug/telemetría) y __sortKey (para ordenar por
// cercanía real al objetivo, o directo por magnitud si el pedido era
// totalmente genérico -- sizeBias "smallest").
export function annotateContext(
  // deno-lint-ignore no-explicit-any
  dedupedContext: any[]
  // deno-lint-ignore no-explicit-any
): any[] {
  // deno-lint-ignore no-explicit-any
  return dedupedContext.map((item: any) => {
    const brandNote = item.__brand ? ` (coincide con la marca pedida: ${item.__brand})` : '';
    if (!item.__target) return { ...item, __specNote: brandNote, __ratio: null, __sortKey: null };
    const spec = extractSpecValue(item.sales_pitch || '', item.__target.unit);
    if (spec == null) return { ...item, __specNote: brandNote, __ratio: null, __sortKey: null };
    const unitLabel = item.__target.unit.toUpperCase();

    if (item.__target.sizeBias === "smallest") {
      const note = ` (potencia detectada: ~${spec} ${unitLabel})${brandNote}`;
      return { ...item, __specNote: note, __ratio: null, __sortKey: spec };
    }

    const ratio = spec / item.__target.value;
    const estimatedNote = item.__target.estimated
      ? ` -- OJO: este objetivo es una ESTIMACIÓN nuestra (el cliente no dio un número), no un dato exacto que haya dado el cliente`
      : '';
    const vecesTexto = ratio >= 1 ? `${round1(ratio)}x el objetivo` : `${round1(1 / ratio)}x más chico que el objetivo`;
    const note = ` (especificación detectada: ~${spec} ${unitLabel} — objetivo ${item.__target.estimated ? 'estimado' : 'del cliente'}: ${item.__target.value} ${unitLabel}, es decir ${vecesTexto}${estimatedNote})${brandNote}`;
    return { ...item, __specNote: note, __ratio: ratio, __sortKey: Math.abs(Math.log(ratio)) };
  });
}

// Agrupa por __groupIndex, ordena cada grupo por __sortKey, diversifica por
// marca los grupos genéricos, y aplica el cupo por grupo (no global) --
// salvo los matches de SKU exacto (gi === -1) o marca explícita (gi < -1),
// que van TODOS siempre sin competir por cupo.
export function buildFinalContext(params: {
  // deno-lint-ignore no-explicit-any
  annotatedContext: any[];
  queryGroups: string[][];
  groupBrands: (string | null)[];
  // deno-lint-ignore no-explicit-any
}): any[] {
  const { annotatedContext, queryGroups, groupBrands } = params;
  const perGroupCap = Math.max(8, Math.floor(40 / Math.max(1, queryGroups.length)));

  // deno-lint-ignore no-explicit-any
  const byGroup = new Map<number, any[]>();
  // deno-lint-ignore no-explicit-any
  annotatedContext.forEach((item: any) => {
    const gi = typeof item.__groupIndex === 'number' ? item.__groupIndex : -1;
    if (!byGroup.has(gi)) byGroup.set(gi, []);
    byGroup.get(gi)!.push(item);
  });

  // deno-lint-ignore no-explicit-any
  const finalContext: any[] = [];
  byGroup.forEach((items, gi) => {
    items.sort((a, b) => {
      const ka = a.__sortKey == null ? Infinity : a.__sortKey;
      const kb = b.__sortKey == null ? Infinity : b.__sortKey;
      return ka - kb;
    });

    const requestedBrand = gi >= 0 ? groupBrands[gi] : null;
    const orderedItems = (gi >= 0 && !requestedBrand) ? diversifyByBrand(items) : items;

    finalContext.push(...(gi < 0 ? orderedItems : orderedItems.slice(0, perGroupCap)));
  });

  return finalContext;
}
