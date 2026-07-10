export async function generateResponse(
  finalPrompt: string,
  geminiHistory: any[],
  geminiKey: string
): Promise<string> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
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
