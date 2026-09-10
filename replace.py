import re

with open('supabase/functions/chat/search.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the data fetch part
old_code = '''    const data = await fetchGeminiWithRotation(() => ({
      url: https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent,
      body: {'''

new_code = '''
    const modelsToTry = [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-3.7-flash', 
      'gemini-3.1-flash-lite'
    ];
    let data = null;
    let lastErr = null;
    for (const model of modelsToTry) {
      try {
        data = await fetchGeminiWithRotation(() => ({
          url: \https://generativelanguage.googleapis.com/v1beta/models/\:generateContent\,
          body: {
'''

text = text.replace(old_code, new_code)

# Add closing brace for the loop
old_close = '''    }));

    if (data.candidates?.[0]?.content?.parts) {'''

new_close = '''    }));
        break;
      } catch (err: any) {
        lastErr = err;
        if (err.toString().includes("404") || err.toString().includes("is not found")) {
          console.warn(Model  not found, trying next...);
          continue;
        }
        throw err;
      }
    }
    if (!data) throw lastErr;

    if (data.candidates?.[0]?.content?.parts) {'''

text = text.replace(old_close, new_close)

with open('supabase/functions/chat/search.ts', 'w', encoding='utf-8') as f:
    f.write(text)
print('Done')
