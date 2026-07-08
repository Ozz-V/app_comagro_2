export async function generateResponse(
  finalPrompt: string,
  geminiHistory: any[],
  geminiKey: string
): Promise<string> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: finalPrompt }] },
        contents: geminiHistory,
        generationConfig: { maxOutputTokens: 8192 }
      })
    });

    if (!res.ok) {
      console.error(JSON.stringify({ event: "gemini_generate_failed", status: res.status }));
      return "El servicio está temporalmente ocupado. Por favor, intenta de nuevo en unos segundos.";
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

export function saveLearnedRule(learnedRule: string, geminiKey: string, supaAdmin: any): void {
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
