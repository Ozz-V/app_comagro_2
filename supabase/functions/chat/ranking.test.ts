// Nota: no usamos "https://deno.land/std/assert" porque esa red no está
// habilitada en todos los entornos de CI/dev -- helpers mínimos locales,
// sin dependencias externas, alcanzan para lo que necesitamos acá.
function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(msg || `assertEquals falló:\n  actual:   ${a}\n  esperado: ${e}`);
  }
}
function assertAlmostEquals(actual: number, expected: number, tolerance = 1e-7) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`assertAlmostEquals falló: actual=${actual} esperado=${expected} (tolerancia=${tolerance})`);
  }
}

import {
  round1,
  extractProductType,
  extractBrand,
  diversifyByBrand,
  normalizeWord,
  extractSpecValue,
  buildGroupCategoryWords,
  detectBlockSubmersible,
  detectAccessoryRequest,
  dedupeAndFilterContext,
  annotateContext,
  buildFinalContext,
} from "./ranking.ts";

// ── round1 ─────────────────────────────────────────────────────────────
Deno.test("round1 redondea a 1 decimal", () => {
  assertEquals(round1(1.234), 1.2);
  assertEquals(round1(1.25), 1.3);
  assertEquals(round1(5), 5);
});

// ── extractProductType ────────────────────────────────────────────────
Deno.test("extractProductType extrae el campo estructurado", () => {
  assertEquals(extractProductType("**Tipo de Producto:** GENERADOR\nOtra línea"), "GENERADOR");
});
Deno.test("extractProductType devuelve null si no hay campo o texto vacío", () => {
  assertEquals(extractProductType("sin ese campo"), null);
  assertEquals(extractProductType(""), null);
});

// ── extractBrand ─────────────────────────────────────────────────────
Deno.test("extractBrand prueba Marca, luego Fabricante, luego Brand", () => {
  assertEquals(extractBrand("**Marca:** Comagro\n"), "Comagro");
  assertEquals(extractBrand("**Fabricante:** OtraMarca\n"), "OtraMarca");
  assertEquals(extractBrand("**Brand:** ThirdMarca\n"), "ThirdMarca");
  assertEquals(extractBrand("nada de esto"), null);
});

// ── diversifyByBrand ───────────────────────────────────────────────────
Deno.test("diversifyByBrand intercala marcas en round-robin preservando orden interno", () => {
  const items = [
    { sku: "A1", sales_pitch: "**Marca:** Comagro" },
    { sku: "A2", sales_pitch: "**Marca:** Comagro" },
    { sku: "B1", sales_pitch: "**Marca:** OtraMarca" },
    { sku: "A3", sales_pitch: "**Marca:** Comagro" },
  ];
  const result = diversifyByBrand(items);
  assertEquals(result.map((i) => i.sku), ["A1", "B1", "A2", "A3"]);
});

Deno.test("diversifyByBrand es no-op si hay una sola marca (o ninguna)", () => {
  const items = [
    { sku: "A1", sales_pitch: "**Marca:** Comagro" },
    { sku: "A2", sales_pitch: "**Marca:** Comagro" },
  ];
  assertEquals(diversifyByBrand(items).map((i) => i.sku), ["A1", "A2"]);

  const sinMarca = [{ sku: "X1", sales_pitch: "sin marca" }];
  assertEquals(diversifyByBrand(sinMarca).map((i) => i.sku), ["X1"]);
});

// ── normalizeWord ──────────────────────────────────────────────────────
Deno.test("normalizeWord saca acentos, minúsculas y plural simple", () => {
  assertEquals(normalizeWord("Generadores"), "generador");
  assertEquals(normalizeWord("bombas"), "bomba");
  assertEquals(normalizeWord("Motor"), "motor");
  assertEquals(normalizeWord("árboles"), "arbol");
});

// ── extractSpecValue ─────────────────────────────────────────────────
Deno.test("extractSpecValue: kva desde 'kva' directo", () => {
  assertEquals(extractSpecValue("Generador 11 KVA trifásico", "kva"), 11);
});
Deno.test("extractSpecValue: kva desde Watts sueltos, normaliza a kW/kVA", () => {
  assertEquals(extractSpecValue("Generador 9000W monofásico", "kva"), 9);
});
Deno.test("extractSpecValue: kva/kw desde HP con el factor 0.7457", () => {
  assertEquals(extractSpecValue("Motor Eléctrico 5.5 HP", "kw"), round1(5.5 * 0.7457));
});
Deno.test("extractSpecValue: HP acepta coma decimal", () => {
  assertEquals(extractSpecValue("Motor 5,5 hp", "kw"), round1(5.5 * 0.7457));
});
Deno.test("extractSpecValue: bar / kg / m3h", () => {
  assertEquals(extractSpecValue("Presión máxima 2.5 bar", "bar"), 2.5);
  assertEquals(extractSpecValue("Peso 120 kg", "kg"), 120);
  assertEquals(extractSpecValue("Caudal 10 m3/h", "m3h"), 10);
});
Deno.test("extractSpecValue devuelve null si no hay match o texto vacío", () => {
  assertEquals(extractSpecValue("sin ningún dato numérico util", "kva"), null);
  assertEquals(extractSpecValue("", "kva"), null);
});

// ── buildGroupCategoryWords ──────────────────────────────────────────
Deno.test("buildGroupCategoryWords filtra stopwords y palabras cortas", () => {
  const result = buildGroupCategoryWords([["bomba de agua"], ["generador"]]);
  assertEquals([...result[0]].sort(), ["agua", "bomba"]);
  assertEquals([...result[1]], ["generador"]);
});

// ── detectBlockSubmersible ───────────────────────────────────────────
Deno.test("detectBlockSubmersible: true si pide 'motor' sin contexto de agua", () => {
  assertEquals(detectBlockSubmersible("quiero un motor eléctrico"), true);
});
Deno.test("detectBlockSubmersible: false si hay contexto de agua/bomba", () => {
  assertEquals(detectBlockSubmersible("motor para bomba de pozo"), false);
});
Deno.test("detectBlockSubmersible: false si ni siquiera pide motor", () => {
  assertEquals(detectBlockSubmersible("quiero un generador"), false);
});

// ── detectAccessoryRequest ───────────────────────────────────────────
// NOTA: "repuesto"/"accesorio" (con esas terminaciones exactas) NO activan
// ACCESSORY_REGEX por un detalle pre-existente del \b final del regex
// original (falla justo después de esas terminaciones) -- se preserva tal
// cual estaba, sin "corregirlo" acá, porque cambiar el regex es una
// decisión de comportamiento aparte de esta extracción. "filtro", "pieza",
// "cable", etc. sí lo activan sin problema.
Deno.test("detectAccessoryRequest: true si el mensaje pide un accesorio explícito (ej. 'filtro')", () => {
  assertEquals(
    detectAccessoryRequest({ lastMessage: "necesito un filtro para mi bomba", chatHistoryText: "", queryGroups: [["filtro para bomba"]] }),
    true,
  );
});
Deno.test("detectAccessoryRequest: true si el historial reciente indica reparación/rotura", () => {
  assertEquals(
    detectAccessoryRequest({ lastMessage: "cuánto sale", chatHistoryText: "user: el motor de la bomba no arranca", queryGroups: [["bomba"]] }),
    true,
  );
});
Deno.test("detectAccessoryRequest: false para un pedido normal de máquina completa", () => {
  assertEquals(
    detectAccessoryRequest({ lastMessage: "quiero un generador", chatHistoryText: "", queryGroups: [["generador"]] }),
    false,
  );
});
Deno.test("detectAccessoryRequest: 'para' solo no cuenta como señal de accesorio (fix 2026-09-03)", () => {
  assertEquals(
    detectAccessoryRequest({ lastMessage: "motor y reductor para un ascensor", chatHistoryText: "", queryGroups: [["motor para ascensor"], ["reductor"]] }),
    false,
  );
});

// ── dedupeAndFilterContext ───────────────────────────────────────────
Deno.test("dedupeAndFilterContext quita SKUs duplicados", () => {
  const combined = [{ sku: "A1", sales_pitch: "x" }, { sku: "A1", sales_pitch: "x" }];
  const result = dedupeAndFilterContext({ combinedContext: combined, blockSubmersible: false, isAccessoryRequest: false });
  assertEquals(result.length, 1);
});
Deno.test("dedupeAndFilterContext descarta SKUs de test/borrado", () => {
  const combined = [{ sku: "TEST-123", sales_pitch: "x" }, { sku: "REAL-1-DELETE-ME", sales_pitch: "x" }, { sku: "OK-1", sales_pitch: "x" }];
  const result = dedupeAndFilterContext({ combinedContext: combined, blockSubmersible: false, isAccessoryRequest: false });
  assertEquals(result.map((i) => i.sku), ["OK-1"]);
});
Deno.test("dedupeAndFilterContext bloquea sumergibles si blockSubmersible=true", () => {
  const combined = [{ sku: "S1", sales_pitch: "motor sumergible" }, { sku: "S2", sales_pitch: "motor normal" }];
  const result = dedupeAndFilterContext({ combinedContext: combined, blockSubmersible: true, isAccessoryRequest: false });
  assertEquals(result.map((i) => i.sku), ["S2"]);
});
Deno.test("dedupeAndFilterContext filtra REPUESTO/ACCESORIO/ATS PARA si no es pedido de accesorio", () => {
  const combined = [
    { sku: "R1", sales_pitch: "**Tipo de Producto:** REPUESTO PARA BOMBA" },
    { sku: "AC1", sales_pitch: "**Tipo de Producto:** ACCESORIO PARA DESBROZADORA" },
    { sku: "ATS1", sales_pitch: "**Tipo de Producto:** ATS PARA GENERADOR" },
    { sku: "G1", sales_pitch: "**Tipo de Producto:** GENERADOR" },
  ];
  const result = dedupeAndFilterContext({ combinedContext: combined, blockSubmersible: false, isAccessoryRequest: false });
  assertEquals(result.map((i) => i.sku), ["G1"]);
});
Deno.test("dedupeAndFilterContext NO filtra por tipo repuesto/accesorio si sí es pedido de accesorio", () => {
  const combined = [{ sku: "R1", sales_pitch: "**Tipo de Producto:** REPUESTO PARA BOMBA" }];
  const result = dedupeAndFilterContext({ combinedContext: combined, blockSubmersible: false, isAccessoryRequest: true });
  assertEquals(result.map((i) => i.sku), ["R1"]);
});

// ── annotateContext ────────────────────────────────────────────────
Deno.test("annotateContext: sin __target, deja __sortKey null", () => {
  const result = annotateContext([{ sku: "A", sales_pitch: "x" }]);
  assertEquals(result[0].__sortKey, null);
  assertEquals(result[0].__ratio, null);
});
Deno.test("annotateContext: sizeBias 'smallest' usa el spec crudo como __sortKey", () => {
  const item = { sku: "A", sales_pitch: "Generador 9000W", __target: { value: 0, unit: "kva", sizeBias: "smallest" } };
  const result = annotateContext([item]);
  assertEquals(result[0].__sortKey, 9);
  assertEquals(result[0].__ratio, null);
});
Deno.test("annotateContext: target real calcula ratio y __sortKey = |log(ratio)|", () => {
  const item = { sku: "A", sales_pitch: "Generador 22 KVA", __target: { value: 11, unit: "kva" } };
  const result = annotateContext([item]);
  assertEquals(result[0].__ratio, 2);
  assertAlmostEquals(result[0].__sortKey!, Math.abs(Math.log(2)), 1e-9);
  assertEquals(result[0].__specNote!.includes("2x el objetivo"), true);
});
Deno.test("annotateContext: spec no detectable deja __sortKey null aunque haya target", () => {
  const item = { sku: "A", sales_pitch: "sin datos numéricos", __target: { value: 11, unit: "kva" } };
  const result = annotateContext([item]);
  assertEquals(result[0].__sortKey, null);
});
Deno.test("annotateContext: incluye nota de marca si __brand está presente", () => {
  const item = { sku: "A", sales_pitch: "x", __brand: "Comagro" };
  const result = annotateContext([item]);
  assertEquals(result[0].__specNote!.includes("coincide con la marca pedida: Comagro"), true);
});

// ── buildFinalContext ────────────────────────────────────────────────
Deno.test("buildFinalContext ordena cada grupo por __sortKey ascendente", () => {
  const annotated = [
    { sku: "LEJOS", __groupIndex: 0, __sortKey: 5 },
    { sku: "CERCA", __groupIndex: 0, __sortKey: 1 },
  ];
  const result = buildFinalContext({ annotatedContext: annotated, queryGroups: [["generador"]], groupBrands: [null] });
  assertEquals(result.map((i) => i.sku), ["CERCA", "LEJOS"]);
});

Deno.test("buildFinalContext: los grupos gi<0 (SKU exacto / marca) pasan TODOS sin cupo", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ sku: `S${i}`, __groupIndex: -1, __sortKey: i }));
  const result = buildFinalContext({ annotatedContext: many, queryGroups: [["x"]], groupBrands: [null] });
  assertEquals(result.length, 50);
});

Deno.test("buildFinalContext: aplica cupo por grupo (no global) a grupos genéricos", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ sku: `S${i}`, __groupIndex: 0, __sortKey: i, sales_pitch: "" }));
  const result = buildFinalContext({ annotatedContext: many, queryGroups: [["x"]], groupBrands: [null] });
  // 1 solo grupo -> cupo = max(8, floor(40/1)) = 40
  assertEquals(result.length, 40);
});

Deno.test("buildFinalContext: con 2 grupos el cupo por grupo se reparte (piso 8)", () => {
  const grupoA = Array.from({ length: 30 }, (_, i) => ({ sku: `A${i}`, __groupIndex: 0, __sortKey: i, sales_pitch: "" }));
  const grupoB = Array.from({ length: 30 }, (_, i) => ({ sku: `B${i}`, __groupIndex: 1, __sortKey: i, sales_pitch: "" }));
  const result = buildFinalContext({
    annotatedContext: [...grupoA, ...grupoB],
    queryGroups: [["generador"], ["bomba"]],
    groupBrands: [null, null],
  });
  // 2 grupos -> cupo = max(8, floor(40/2)) = 20 cada uno
  assertEquals(result.filter((i) => i.sku.startsWith("A")).length, 20);
  assertEquals(result.filter((i) => i.sku.startsWith("B")).length, 20);
});

Deno.test("buildFinalContext: no diversifica por marca si el cliente pidió una marca explícita", () => {
  const items = [
    { sku: "A1", __groupIndex: 0, __sortKey: 1, sales_pitch: "**Marca:** Comagro" },
    { sku: "A2", __groupIndex: 0, __sortKey: 2, sales_pitch: "**Marca:** Comagro" },
    { sku: "B1", __groupIndex: 0, __sortKey: 3, sales_pitch: "**Marca:** OtraMarca" },
  ];
  const result = buildFinalContext({ annotatedContext: items, queryGroups: [["cable Comagro"]], groupBrands: ["Comagro"] });
  // Sin diversidad forzada: se mantiene el orden por __sortKey tal cual.
  assertEquals(result.map((i) => i.sku), ["A1", "A2", "B1"]);
});
