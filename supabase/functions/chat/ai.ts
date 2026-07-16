export async function generateResponse(
  finalPrompt: string,
  // deno-lint-ignore no-explicit-any
  geminiHistory: any[],
  geminiKey: string
): Promise<string> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: finalPrompt }] },
        contents: geminiHistory,
        generationConfig: { maxOutputTokens: 8192 }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(JSON.stringify({ event: "gemini_generate_failed", status: res.status, error: errText }));
      
      if (res.status === 429) {
        return "Nuestros servidores están recibiendo muchas consultas en este momento. Por favor, intenta de nuevo en unos minutos.";
      }
      return "Lo siento, tuvimos un problema de conexión temporal. Por favor, intenta de nuevo.";
    }

    const data = await res.json();
    if (data.candidates?.[0]?.content?.parts) {
      return data.candidates[0].content.parts[0].text.trim();
    }
  } catch (e) {
    console.error(JSON.stringify({ event: "gemini_generate_error", error: String(e) }));
  }
  return "Lo siento, tuve un problema interno. Intenta de nuevo.";
}

export function parseLearnTag(reply: string): { cleanReply: string; learnedRule: string | null } {
  const match = reply.match(/\[LEARN:\s*(.*?)\]/);
  if (!match) return { cleanReply: reply, learnedRule: null };
  return {
    cleanReply: reply.replace(/\[LEARN:.*?\]/g, "").trim(),
    learnedRule: match[1].trim()
  };
}

// El modelo (gemini-3.1-flash-lite, barato y rápido, pero no 100% obediente)
// a veces INVENTA códigos de producto con pinta real cuando no encuentra
// nada bueno para ofrecer — suele copiar el patrón de los SKUs de ejemplo
// del prompt ("D-60", "ZT-50") o de SKUs reales que vio antes en la misma
// conversación. Esto es peor que decir "no tenemos": le muestra al cliente
// una ficha de producto que no existe. Como no podemos garantizar al 100%
// que el modelo obedezca la instrucción de "no inventes", lo validamos acá:
// cualquier [SKU: XXX] que no esté en la lista real de productos que le
// pasamos como contexto ESTE turno, se borra sin excepción.
export function stripHallucinatedSkus(
  reply: string,
  validSkus: Set<string>
): { cleanReply: string; hallucinated: string[] } {
  const tagPattern = /\[SKU:\s*([^\]]+)\]/gi;
  const found = [...reply.matchAll(tagPattern)].map(m => m[1].trim());
  if (found.length === 0) return { cleanReply: reply, hallucinated: [] };

  const hallucinated = found.filter(sku => !validSkus.has(sku));
  const validKept = found.length - hallucinated.length;

  if (hallucinated.length === 0) return { cleanReply: reply, hallucinated: [] };

  // Si TODOS los SKUs que mostraba eran inventados, la respuesta entera
  // parte de una premisa falsa ("tengo estas opciones..." de productos que
  // no existen) — no alcanza con borrar los tags, hay que reemplazar el
  // mensaje completo por algo honesto.
  if (validKept === 0) {
    return {
      cleanReply: 'No encontré ese producto específico en nuestro catálogo por el momento. ¿Podrías darme más detalles (marca, modelo o uso) para buscar alternativas?',
      hallucinated,
    };
  }

  // Si hubo una mezcla (algunos reales, algunos inventados), solo borramos
  // los tags falsos y dejamos los reales — el texto puede quedar un poco
  // menos prolijo, pero nunca se muestra una ficha de producto fantasma.
  const cleanReply = reply;
  for (const sku of hallucinated) {
    const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleanReply = cleanReply.replace(new RegExp(`\\[SKU:\\s*${escaped}\\s*\\]\\n?`, 'gi'), '');
  }
  cleanReply = cleanReply.trim();

  return { cleanReply, hallucinated };
}

// Patrones sospechosos de prompt injection (multi-idioma)
const INJECTION_PATTERNS = [
  /ignora\s+(tus\s+)?instrucciones/i,
  /ignore\s+(your\s+)?instructions/i,
  /olvida\s+(todo|tus\s+reglas)/i,
  /forget\s+(everything|your\s+rules)/i,
  /eres\s+(ahora|un|una)\s+(?!asesor)/i,
  /you\s+are\s+now/i,
  /act\s+as/i,
  /jailbreak/i,
  /system\s*:/i,
  /\[\s*system\s*\]/i,
  /<\s*system/i,
];

const MAX_RULE_LENGTH = 500;

// deno-lint-ignore no-explicit-any
export function saveLearnedRule(learnedRule: string, geminiKey: string, supaAdmin: any): void {
  // ── Validación de seguridad ────────────────────────────────────────────────
  if (learnedRule.length > MAX_RULE_LENGTH) {
    console.warn(JSON.stringify({
      event: 'learn_rejected',
      reason: 'too_long',
      length: learnedRule.length,
      preview: learnedRule.substring(0, 100),
    }));
    return;
  }

  const suspiciousPattern = INJECTION_PATTERNS.find(p => p.test(learnedRule));
  if (suspiciousPattern) {
    console.warn(JSON.stringify({
      event: 'learn_rejected',
      reason: 'injection_pattern',
      pattern: suspiciousPattern.toString(),
      preview: learnedRule.substring(0, 100),
    }));
    return;
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Fire and forget (zero latency for user)
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
    body: JSON.stringify({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text: learnedRule }] },
      outputDimensionality: 768,
      taskType: "RETRIEVAL_DOCUMENT"
    })
  }).then(r => r.json()).then(data => {
    if (data?.embedding?.values) {
      // Insert into a suggestions table to prevent automatic poisoning
      supaAdmin.from('ai_knowledge_suggestions').insert({
        rule: learnedRule,
        embedding: data.embedding.values,
        status: 'pending'
      }).then();
    }
  }).catch(err => console.error("Error saving knowledge:", err));
}
