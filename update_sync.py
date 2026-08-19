import re

with open('supabase/functions/sync-plytix/index.ts', 'r', encoding='utf-8') as f:
    text = f.read()

import_stmt = 'import { getGeminiKeys, fetchWithGeminiRotation } from "../shared/gemini.ts";\n'
if import_stmt not in text:
    text = import_stmt + text

target1 = """    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';"""

replacement1 = """    const keys = getGeminiKeys();
    const geminiKey = keys.length > 0 ? keys[0] : '';"""
text = text.replace(target1, replacement1)

target2 = """         const generateRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
            body: JSON.stringify({
               contents: [{ role: 'user', parts: [{ text: prompt }] }],
               generationConfig: { maxOutputTokens: 2000, temperature: 0.3 }
            })
         });"""

replacement2 = """         const generateRes = await fetchWithGeminiRotation(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`,
            { method: 'POST' },
            {
               contents: [{ role: 'user', parts: [{ text: prompt }] }],
               generationConfig: { maxOutputTokens: 2000, temperature: 0.3 }
            }
         );"""
text = text.replace(target2, replacement2)

target3 = """         const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
            body: JSON.stringify({
               model: 'models/gemini-embedding-2',
               content: { parts: [{ text: embedText }] },
               outputDimensionality: 768,
               taskType: "RETRIEVAL_DOCUMENT"
            })
         });"""

replacement3 = """         const embedRes = await fetchWithGeminiRotation(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`,
            { method: 'POST' },
            {
               model: 'models/gemini-embedding-2',
               content: { parts: [{ text: embedText }] },
               outputDimensionality: 768,
               taskType: "RETRIEVAL_DOCUMENT"
            }
         );"""
text = text.replace(target3, replacement3)

target4 = """.select('*')
      .eq('status', 'pending')
      .order('updated_at', { ascending: true })"""

replacement4 = """.select('*')
      .in('status', ['pending', 'error'])
      .order('updated_at', { ascending: true })"""
text = text.replace(target4, replacement4)


with open('supabase/functions/sync-plytix/index.ts', 'w', encoding='utf-8') as f:
    f.write(text)
print('Done sync-plytix!')
