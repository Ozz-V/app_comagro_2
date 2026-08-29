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
function loadGeminiKeys(): string[] {
  const keys: string[] = [];
  
  // 1. GEMINI_API_KEYS (comma separated)
  const commaList = Deno.env.get('GEMINI_API_KEYS');
  if (commaList) {
    const parts = commaList.split(',').map(k => k.trim()).filter(Boolean);
    if (parts.length > 0) {
      keys.push(...parts);
      return [...new Set(keys)];
    }
  }
  
  // 2. Numbered variables
  let hasNumberedKeys = false;
  let i = 1;
  while (true) {
    const k = Deno.env.get(`GEMINI_API_KEY_${i}`);
    if (!k) break; // Stop at first undefined
    if (k.trim()) keys.push(k.trim());
    hasNumberedKeys = true;
    i++;
  }
  
  if (hasNumberedKeys) {
    return [...new Set(keys)];
  }
  
  // 3. Fallback to singular
  const k0 = Deno.env.get('GEMINI_API_KEY');
  if (k0 && k0.trim()) {
    keys.push(k0.trim());
  }
  
  return [...new Set(keys)];
}

export const GEMINI_KEYS = loadGeminiKeys();

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
export async function fetchGeminiWithRotation(
  buildRequest: (key: string) => { url: string; body: unknown },
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  if (GEMINI_KEYS.length === 0) {
    throw new Error('No hay API keys de Gemini configuradas.');
  }

  let lastErrorText = '';
  let lastStatus = 500;

  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const idx = (currentKeyIndex + attempt) % GEMINI_KEYS.length;
    const key = GEMINI_KEYS[idx];
    const { url, body } = buildRequest(key);
    const keyHint = key.length > 4 ? `...${key.slice(-4)}` : '(muy corta)';

    let res: Response;
    // Timeout defensivo: sin esto, si Google responde lento con la key
    // actual (degradación temporal, no necesariamente un error de status),
    // el fetch podía quedar esperando indefinidamente y todo el chat se
    // sentía "trabado" muchos segundos de más antes de intentar rotar. Con
    // este límite, a los 12s cortamos y probamos la próxima key en vez de
    // seguir esperando a la misma que ya viene lenta.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (networkErr) {
      // Error de red O timeout (AbortError): también rotamos, un hipo de
      // red o una key lenta en un momento dado no debería tirar abajo todo
      // el chat si las otras keys/conexiones sí responden rápido.
      lastErrorText = String(networkErr);
      lastStatus = 0;
      console.warn(`Gemini key #${idx + 1}/${GEMINI_KEYS.length} (${keyHint}) falló por red o timeout (12s). Rotando a la siguiente...`);
      continue;
    } finally {
      clearTimeout(timeoutId);
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
