import re

with open('supabase/functions/chat/search.ts', 'r', encoding='utf-8') as f:
    text = f.read()

import_stmt = 'import { fetchWithGeminiRotation } from "../shared/gemini.ts";\n'
if import_stmt not in text:
    text = import_stmt + text

# Replace extractIntent
target1 = """    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.1 }
      })
    });"""

replacement1 = """    const res = await fetchWithGeminiRotation(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`,
      { method: 'POST' },
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.1 }
      }
    );"""
text = text.replace(target1, replacement1)

# Replace getEmbedding
target2 = """    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        model: 'models/gemini-embedding-2',
        content: { parts: [{ text: text }] },
        outputDimensionality: 768,
        taskType: "RETRIEVAL_DOCUMENT"
      })
    });"""

replacement2 = """    const res = await fetchWithGeminiRotation(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`,
      { method: 'POST' },
      {
        model: 'models/gemini-embedding-2',
        content: { parts: [{ text: text }] },
        outputDimensionality: 768,
        taskType: "RETRIEVAL_DOCUMENT"
      }
    );"""
text = text.replace(target2, replacement2)

with open('supabase/functions/chat/search.ts', 'w', encoding='utf-8') as f:
    f.write(text)
print('Done search.ts!')
