import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ─────────────────────────────────────────────────────────────────────────
// SALUD DE KEYS PERSISTIDA EN DB: currentKeyIndex vive solo en memoria, y
// Deno resetea la memoria en cada cold start -- eso significaba que, si la
// key #1 quedaba agotada de cuota (429) o inválida (403), CADA cold start
// volvía a probarla primero y pagaba el timeout completo (antes 12s) de
// nuevo, aunque ya supiéramos hace rato que esa key no sirve hasta que se
// resetee su cuota. Acá guardamos ese conocimiento en la tabla
// gemini_key_health para que sobreviva a los cold starts: una vez que una
// key falla por cuota/permiso, se salta directo a la siguiente durante el
// tiempo de bloqueo, sin gastar tiempo real reintentándola a ciegas.
// Cache en memoria con TTL corto para no pegarle a la DB en cada llamada a
// Gemini (una sola consulta por invocación de Edge Function alcanza).
const KEY_HEALTH_TABLE = 'gemini_key_health';
const HEALTH_CACHE_TTL_MS = 60_000;

let healthCache: { blockedUntil: Map<number, number>; fetchedAt: number } | null = null;

function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key);
}

async function loadKeyHealth(): Promise<Map<number, number>> {
  const now = Date.now();
  if (healthCache && (now - healthCache.fetchedAt) < HEALTH_CACHE_TTL_MS) {
    return healthCache.blockedUntil;
  }
  const map = new Map<number, number>();
  try {
    const admin = getAdminClient();
    const { data } = await admin.from(KEY_HEALTH_TABLE).select('key_index, blocked_until');
    // deno-lint-ignore no-explicit-any
    for (const row of (data || []) as any[]) {
      if (row.blocked_until) {
        const t = new Date(row.blocked_until).getTime();
        if (t > now) map.set(row.key_index, t);
      }
    }
  } catch (_e) {
    // Si la tabla todavía no existe o falla la lectura, seguimos sin
    // bloqueos -- mejor eso que trabar el chat entero por esto.
  }
  healthCache = { blockedUntil: map, fetchedAt: now };
  return map;
}

function markKeyBlocked(idx: number, ms: number): void {
  if (!healthCache) healthCache = { blockedUntil: new Map(), fetchedAt: Date.now() };
  healthCache.blockedUntil.set(idx, Date.now() + ms);

  // Fire-and-forget: esto no debe sumar latencia a la respuesta del chat.
  getAdminClient().from(KEY_HEALTH_TABLE).upsert({
    key_index: idx,
    blocked_until: new Date(Date.now() + ms).toISOString(),
    updated_at: new Date().toISOString(),
  }).then().catch(() => {});
}

function clearKeyBlock(idx: number): void {
  if (healthCache?.blockedUntil.has(idx)) healthCache.blockedUntil.delete(idx);
  getAdminClient().from(KEY_HEALTH_TABLE).upsert({
    key_index: idx,
    blocked_until: null,
    updated_at: new Date().toISOString(),
  }).then().catch(() => {});
}

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

  const blocked = await loadKeyHealth();

  // Orden de intento: arrancamos en currentKeyIndex y damos la vuelta, pero
  // saltando las keys marcadas como bloqueadas (429/403 recientes) en la DB
  // -- así un cold start no vuelve a pagar el timeout completo de una key
  // que YA sabemos que no sirve por ahora. Si TODAS están bloqueadas (caso
  // límite raro), probamos igual en el orden normal -- mejor eso que fallar
  // de entrada sin ni siquiera intentar.
  const allBlocked = GEMINI_KEYS.every((_, i) => blocked.has(i));
  const order: number[] = [];
  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const idx = (currentKeyIndex + attempt) % GEMINI_KEYS.length;
    if (allBlocked || !blocked.has(idx)) order.push(idx);
  }

  let lastErrorText = '';
  let lastStatus = 500;

  for (const idx of order) {
    const key = GEMINI_KEYS[idx];
    const { url, body } = buildRequest(key);
    const keyHint = key.length > 4 ? `...${key.slice(-4)}` : '(muy corta)';

    let res: Response;
    // Timeout defensivo, bajado de 12s a 6s: con el bloqueo persistido ya
    // no dependemos tanto de este valor para "salvarnos" de una key mala
    // (eso ahora lo evita loadKeyHealth de entrada), así que lo bajamos
    // para que un hipo puntual de red cueste menos si igual llega a pasar.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (networkErr) {
      // Error de red O timeout (AbortError): también rotamos. Bloqueamos
      // esta key por poco tiempo (5 min) -- puede ser un hipo transitorio,
      // no necesariamente que la key esté agotada, así que no la
      // castigamos 24h por esto.
      lastErrorText = String(networkErr);
      lastStatus = 0;
      console.warn(`Gemini key #${idx + 1}/${GEMINI_KEYS.length} (${keyHint}) falló por red o timeout (6s). Rotando a la siguiente...`);
      markKeyBlocked(idx, 5 * 60 * 1000);
      continue;
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.ok) {
      currentKeyIndex = idx; // esta key sirvió, la dejamos "fijada" para la próxima llamada
      if (blocked.has(idx)) clearKeyBlock(idx); // se recuperó antes de lo esperado -- la desbloqueamos
      return await res.json();
    }

    lastStatus = res.status;
    lastErrorText = await res.text();
    console.warn(`Gemini key #${idx + 1}/${GEMINI_KEYS.length} (${keyHint}) falló (status ${res.status}). Rotando a la siguiente...`);

    // 429 (cuota agotada) o 403 (permiso/credencial inválida): esto no se
    // arregla solo en el próximo segundo -- bloqueamos 24h (la cuota de
    // Gemini se resetea diario) para que NINGÚN cold start futuro vuelva a
    // perder tiempo probando esta key hasta entonces.
    if (lastStatus === 429 || lastStatus === 403) {
      markKeyBlocked(idx, 24 * 60 * 60 * 1000);
    } else {
      // Otro error (500 de Google, etc.): bloqueo corto, probablemente
      // transitorio.
      markKeyBlocked(idx, 5 * 60 * 1000);
    }
  }

  // Se probaron TODAS las keys disponibles (o todas, si estaban todas
  // bloqueadas) y ninguna funcionó.
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
