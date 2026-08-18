// Módulo compartido de rotación de API keys de Gemini para la función de
// chat. Lo usan search.ts (extractIntent, getEmbedding) y ai.ts
// (generateResponse, saveLearnedRule) para que TODAS las llamadas a Gemini
// del chat compartan la misma lista de keys y el mismo puntero de "key
// actual" -- sin duplicar la lógica de rotación en cada archivo.
//
// Definí en los secrets de Supabase la variable GEMINI_API_KEYS con TODAS
// las keys separadas por coma, por ejemplo:
//   GEMINI_API_KEYS = "AIzaSy_cuenta1,AIzaSy_cuenta2,AIzaSy_cuenta3,AIzaSy_cuenta4"
// Podés poner 1, 4 o las que quieras: nunca hay que tocar el código, solo
// esa variable. (Por compatibilidad, si no existe GEMINI_API_KEYS pero sí
// existe la vieja GEMINI_API_KEY con una sola key, también funciona igual.)
const geminiKeysRaw = Deno.env.get('GEMINI_API_KEYS') ?? Deno.env.get('GEMINI_API_KEY') ?? '';
export const GEMINI_KEYS = geminiKeysRaw.split(',').map(k => k.trim()).filter(Boolean);

// Índice de la "key actual". Vive a nivel de módulo: al ser un solo módulo
// importado desde search.ts y ai.ts, el puntero es COMPARTIDO entre las 4
// llamadas a Gemini del chat, y persiste entre invocaciones mientras la
// instancia de Deno siga caliente.
let currentKeyIndex = 0;

// Hace un POST a Gemini probando la key actual. Si esa key falla por
// CUALQUIER motivo (429 cuota, 403 permiso, 401 credencial inválida, 500 de
// Google, un error de red, o cualquier cosa que hoy no conocemos), rota
// automáticamente a la siguiente key de la lista y reintenta la MISMA
// llamada -- nunca asumimos que "todas las keys van a fallar igual", así
// que siempre les damos la oportunidad a las demás antes de rendirnos.
// A diferencia del batch del sync (que puede esperar al próximo cron), acá
// es una request de chat en vivo: si las N keys fallan, se lanza el error
// para que quien llamó decida qué mensaje mostrarle al usuario.
// deno-lint-ignore no-explicit-any
export async function fetchGeminiWithRotation(
  buildRequest: (key: string) => { url: string; body: unknown },
): Promise<any> {
  if (GEMINI_KEYS.length === 0) {
    throw new Error('No hay API keys de Gemini configuradas. Definí GEMINI_API_KEYS en los secrets de Supabase.');
  }

  let lastErrorText = '';
  let lastStatus = 500;

  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const idx = (currentKeyIndex + attempt) % GEMINI_KEYS.length;
    const key = GEMINI_KEYS[idx];
    const { url, body } = buildRequest(key);
    const keyHint = key.length > 4 ? `...${key.slice(-4)}` : '(muy corta)';

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      // Error de red (timeout, DNS, etc.): también rotamos, no es exclusivo
      // de errores HTTP -- un hipo de red en una key no debería tirar abajo
      // todo el chat si las otras keys/conexiones sí responden.
      lastErrorText = String(networkErr);
      lastStatus = 0;
      console.warn(`Gemini key #${idx + 1}/${GEMINI_KEYS.length} (${keyHint}) falló por red. Rotando a la siguiente...`);
      continue;
    }

    if (res.ok) {
      currentKeyIndex = idx; // esta key sirvió, la dejamos "fijada" para la próxima llamada
      return await res.json();
    }

    lastStatus = res.status;
    lastErrorText = await res.text();
    console.warn(`Gemini key #${idx + 1}/${GEMINI_KEYS.length} (${keyHint}) falló (status ${res.status}). Rotando a la siguiente...`);
  }

  // Se probaron TODAS las keys y ninguna funcionó.
  const err = new Error(`Las ${GEMINI_KEYS.length} key(s) de Gemini configuradas fallaron. Último status: ${lastStatus}. Último error: ${lastErrorText}`);
  (err as Error & { status?: number }).status = lastStatus;
  throw err;
}

// Chequeo de salud liviano para el /ping del health check. Prueba las keys
// una por una contra el endpoint de metadata del modelo (GET) -- no pasa
// por generateContent, así que no gasta tokens de inferencia ni cuota.
// Reporta cuántas de las N keys configuradas están realmente operativas en
// este momento, para poder ver en el ping si "las 4 andan" o si ya viene
// funcionando con menos.
export async function checkGeminiHealth(): Promise<{ ok: boolean; workingKeys: number; totalKeys: number; lastError?: string }> {
  if (GEMINI_KEYS.length === 0) {
    return { ok: false, workingKeys: 0, totalKeys: 0, lastError: 'GEMINI_API_KEYS no configurada' };
  }

  let working = 0;
  let lastError = '';

  for (const key of GEMINI_KEYS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite?key=${key}`,
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);
      if (res.ok) {
        working++;
      } else {
        lastError = `status ${res.status}`;
      }
    } catch (e) {
      lastError = String(e);
    }
  }

  return { ok: working > 0, workingKeys: working, totalKeys: GEMINI_KEYS.length, lastError: working > 0 ? undefined : lastError };
}
