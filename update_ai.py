import re

with open('supabase/functions/chat/ai.ts', 'r', encoding='utf-8') as f:
    text = f.read()

import_stmt = 'import { fetchWithGeminiRotation } from "../shared/gemini.ts";\n'
if import_stmt not in text:
    text = import_stmt + text

# Replace generateResponse fetch
target1 = """    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: finalPrompt }] },
        contents: geminiHistory,
        generationConfig: { maxOutputTokens: 8192 }
      })
    });"""

replacement1 = """    const res = await fetchWithGeminiRotation(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`,
      { method: 'POST' },
      {
        systemInstruction: { parts: [{ text: finalPrompt }] },
        contents: geminiHistory,
        generationConfig: { maxOutputTokens: 8192 }
      }
    );"""
text = text.replace(target1, replacement1)

# Replace saveLearnedRule fetch
target2 = """  fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
    body: JSON.stringify({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text: learnedRule }] },
      outputDimensionality: 768,
      taskType: "RETRIEVAL_DOCUMENT"
    })
  })"""

replacement2 = """  fetchWithGeminiRotation(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`,
    { method: 'POST' },
    {
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text: learnedRule }] },
      outputDimensionality: 768,
      taskType: "RETRIEVAL_DOCUMENT"
    }
  )"""
text = text.replace(target2, replacement2)

with open('supabase/functions/chat/ai.ts', 'w', encoding='utf-8') as f:
    f.write(text)
print('Done ai.ts!')
