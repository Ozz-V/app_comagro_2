function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(msg || `assertEquals falló:\n  actual:   ${a}\n  esperado: ${e}`);
  }
}
function assertIncludes(haystack: string, needle: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`Se esperaba que el texto incluyera:\n  "${needle}"\n...pero no apareció.`);
  }
}
function assertNotIncludes(haystack: string, needle: string) {
  if (haystack.includes(needle)) {
    throw new Error(`Se esperaba que el texto NO incluyera:\n  "${needle}"\n...pero sí apareció.`);
  }
}

import { buildDbContextText, buildFinalPrompt, DEFAULT_AI_PROMPT } from "./promptBuilder.ts";

// ── buildDbContextText ──────────────────────────────────────────────
Deno.test("buildDbContextText: vacío si no hay conocimiento ni contexto", () => {
  const result = buildDbContextText({ knowledgeData: [], finalContext: [], queryGroups: [], groupBrands: [] });
  assertEquals(result, '');
});

Deno.test("buildDbContextText: incluye el bloque de reglas de la empresa si hay knowledgeData", () => {
  const result = buildDbContextText({
    knowledgeData: [{ rule: "Siempre ofrecer garantía extendida" }],
    finalContext: [],
    queryGroups: [],
    groupBrands: [],
  });
  assertIncludes(result, "REGLAS DE LA EMPRESA");
  assertIncludes(result, "Siempre ofrecer garantía extendida");
});

Deno.test("buildDbContextText: lista cada producto con SKU, Tipo y Descripción", () => {
  const finalContext = [
    { sku: "D-60", sales_pitch: "**Tipo de Producto:** GENERADOR\nGenerador 60 kva", __specNote: " (nota)" },
  ];
  const result = buildDbContextText({ knowledgeData: [], finalContext, queryGroups: [["generador"]], groupBrands: [null] });
  assertIncludes(result, "1. SKU: D-60 | Tipo: GENERADOR | Descripción:");
  assertIncludes(result, "(nota)");
  assertIncludes(result, "REGLA DE SUGERENCIA Y ALTERNATIVAS");
});

Deno.test("buildDbContextText: agrega REGLA DE VARIANTES si hay más de 4 matches exactos (gi === -1)", () => {
  const finalContext = Array.from({ length: 5 }, (_, i) => ({ sku: `SKU-${i}`, __groupIndex: -1, sales_pitch: "" }));
  const result = buildDbContextText({ knowledgeData: [], finalContext, queryGroups: [["codigo"]], groupBrands: [null] });
  assertIncludes(result, "REGLA DE VARIANTES DEL MISMO CÓDIGO");
  assertIncludes(result, "coincide con 5 productos distintos");
});

Deno.test("buildDbContextText: NO agrega REGLA DE VARIANTES con 4 o menos matches exactos", () => {
  const finalContext = Array.from({ length: 4 }, (_, i) => ({ sku: `SKU-${i}`, __groupIndex: -1, sales_pitch: "" }));
  const result = buildDbContextText({ knowledgeData: [], finalContext, queryGroups: [["codigo"]], groupBrands: [null] });
  assertNotIncludes(result, "REGLA DE VARIANTES DEL MISMO CÓDIGO");
});

Deno.test("buildDbContextText: agrega nota de marcas disponibles si un grupo genérico trae 2+ marcas", () => {
  const finalContext = [
    { sku: "A1", __groupIndex: 0, sales_pitch: "**Marca:** Comagro" },
    { sku: "B1", __groupIndex: 0, sales_pitch: "**Marca:** OtraMarca" },
  ];
  const result = buildDbContextText({
    knowledgeData: [], finalContext, queryGroups: [["cable"]], groupBrands: [null],
  });
  assertIncludes(result, 'MARCAS DISPONIBLES PARA "cable"');
  assertIncludes(result, "Comagro, OtraMarca");
});

Deno.test("buildDbContextText: NO agrega nota de marcas si el cliente pidió marca explícita para ese grupo", () => {
  const finalContext = [
    { sku: "A1", __groupIndex: 0, sales_pitch: "**Marca:** Comagro" },
    { sku: "B1", __groupIndex: 0, sales_pitch: "**Marca:** OtraMarca" },
  ];
  const result = buildDbContextText({
    knowledgeData: [], finalContext, queryGroups: [["cable Comagro"]], groupBrands: ["Comagro"],
  });
  assertNotIncludes(result, "MARCAS DISPONIBLES PARA");
});

Deno.test("buildDbContextText: NO agrega nota de marcas si solo hay una marca detectada en el grupo", () => {
  const finalContext = [
    { sku: "A1", __groupIndex: 0, sales_pitch: "**Marca:** Comagro" },
    { sku: "A2", __groupIndex: 0, sales_pitch: "**Marca:** Comagro" },
  ];
  const result = buildDbContextText({
    knowledgeData: [], finalContext, queryGroups: [["cable"]], groupBrands: [null],
  });
  assertNotIncludes(result, "MARCAS DISPONIBLES PARA");
});

// ── buildFinalPrompt ─────────────────────────────────────────────────
Deno.test("buildFinalPrompt: usa el prompt default si no hay ai_prompt configurado", () => {
  const result = buildFinalPrompt({ configAiPrompt: null, dbContextText: '', queryGroupsLength: 1 });
  assertIncludes(result, DEFAULT_AI_PROMPT);
});

Deno.test("buildFinalPrompt: usa el ai_prompt de app_config si está configurado", () => {
  const result = buildFinalPrompt({ configAiPrompt: "PROMPT PERSONALIZADO DE LA EMPRESA", dbContextText: '', queryGroupsLength: 1 });
  assertIncludes(result, "PROMPT PERSONALIZADO DE LA EMPRESA");
  assertNotIncludes(result, DEFAULT_AI_PROMPT);
});

Deno.test("buildFinalPrompt: siempre agrega la regla de brevedad en código (tenga o no ai_prompt configurado)", () => {
  const conDefault = buildFinalPrompt({ configAiPrompt: null, dbContextText: '', queryGroupsLength: 1 });
  const conCustom = buildFinalPrompt({ configAiPrompt: "otro prompt", dbContextText: '', queryGroupsLength: 1 });
  assertIncludes(conDefault, "REGLA CRÍTICA DE BREVEDAD");
  assertIncludes(conCustom, "REGLA CRÍTICA DE BREVEDAD");
});

Deno.test("buildFinalPrompt: incluye el dbContextText en el medio", () => {
  const result = buildFinalPrompt({ configAiPrompt: "BASE", dbContextText: "CONTEXTO_DE_PRODUCTOS_X", queryGroupsLength: 1 });
  assertIncludes(result, "CONTEXTO_DE_PRODUCTOS_X");
});

Deno.test("buildFinalPrompt: sin aviso de pedido masivo con 4 o menos grupos", () => {
  const result = buildFinalPrompt({ configAiPrompt: "BASE", dbContextText: '', queryGroupsLength: 4 });
  assertNotIncludes(result, "REGLA DE PEDIDOS MASIVOS");
});

Deno.test("buildFinalPrompt: aviso de pedido masivo (variante exacta) con 5 grupos", () => {
  const result = buildFinalPrompt({ configAiPrompt: "BASE", dbContextText: '', queryGroupsLength: 5 });
  assertIncludes(result, "Te pasé los 4 productos y en el siguiente mensaje puedes volver a pedirme el 5to producto");
});

Deno.test("buildFinalPrompt: aviso de pedido masivo (variante 'más de 5') con 6+ grupos", () => {
  const result = buildFinalPrompt({ configAiPrompt: "BASE", dbContextText: '', queryGroupsLength: 7 });
  assertIncludes(result, "Te pasé los 4 productos que me pediste y los demás productos que faltan");
});

Deno.test("buildFinalPrompt: el orden es prompt base + contexto + brevedad + reglas + aviso masivo", () => {
  const result = buildFinalPrompt({ configAiPrompt: "BASE_X", dbContextText: "CTX_Y", queryGroupsLength: 6 });
  const iBase = result.indexOf("BASE_X");
  const iCtx = result.indexOf("CTX_Y");
  const iBrevedad = result.indexOf("REGLA CRÍTICA DE BREVEDAD");
  const iMasivo = result.indexOf("REGLA DE PEDIDOS MASIVOS");
  if (!(iBase < iCtx && iCtx < iBrevedad && iBrevedad < iMasivo)) {
    throw new Error(`Orden inesperado: BASE_X=${iBase} CTX_Y=${iCtx} brevedad=${iBrevedad} masivo=${iMasivo}`);
  }
});
