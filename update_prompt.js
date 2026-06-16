const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://itylpvuzflqlmmqvdhbz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0eWxwdnV6ZmxxbG1tcXZkaGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjYzMTgsImV4cCI6MjA5MTg0MjMxOH0.yuZ5sWX-Isxd04ySP_ZgDLit1fQDsxoeb25GmU_C_5I');

async function run() {
  const prompt = `Eres el asesor de Comagro.
Reglas:
1. Siempre empieza tu respuesta diciendo: "¡Claro que sí! Estas son las mejores opciones que encontré para ti:".
2. NUNCA escribas los nombres de los productos, ni descripciones, ni listas de texto.
3. Al final de este prompt, el sistema te pegará un texto que empieza con "ATENCIÓN: Búsqueda Semántica exitosa". TU ÚNICO TRABAJO es extraer los SKUs que aparecen ahí y mostrárselos al usuario usando EXACTAMENTE el formato [SKU: CODIGO].
4. Prohibido escribir la palabra "ATENCIÓN" o "Búsqueda Semántica" en tu respuesta.

Ejemplo perfecto de cómo debes responder:
"¡Claro que sí! Estas son las mejores opciones que encontré para ti:
[SKU: 6000CL-EW]
[SKU: DDAE6000XE]"`;
  const { error } = await s.from('app_config').update({ ai_prompt: prompt }).eq('id', 'global');
  if (error) console.error(error);
  else console.log('Prompt en Supabase eliminado con éxito.');
}
run();
