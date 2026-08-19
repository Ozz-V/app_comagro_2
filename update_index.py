import re

with open('supabase/functions/chat/index.ts', 'r', encoding='utf-8') as f:
    text = f.read()

import_stmt = 'import { getGeminiKeys } from "../shared/gemini.ts";\n'
if import_stmt not in text:
    text = import_stmt + text

target1 = """      const geminiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiKey) {"""

replacement1 = """      const keys = getGeminiKeys();
      if (keys.length === 0) {"""
text = text.replace(target1, replacement1)

target2 = """        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite?key=${geminiKey}`,
          { signal: controller.signal },
        );"""

replacement2 = """        // Just ping the first available key
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite?key=${keys[0]}`,
          { signal: controller.signal },
        );"""
text = text.replace(target2, replacement2)

target3 = """    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
    if (!geminiKey) throw new Error('GEMINI_API_KEY missing');"""

replacement3 = """    const keys = getGeminiKeys();
    if (keys.length === 0) throw new Error('GEMINI_API_KEY missing');
    const geminiKey = keys[0]; // just for extractIntent fallback signature, though they will use rotation internally"""
text = text.replace(target3, replacement3)

with open('supabase/functions/chat/index.ts', 'w', encoding='utf-8') as f:
    f.write(text)
print('Done index.ts!')
