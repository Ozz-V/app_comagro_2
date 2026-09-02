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

// NOTA: acá NO usamos el cliente de @supabase/supabase-js a propósito -- este
// archivo se importa también desde tests con Jest/Node (no Deno), que no
// puede resolver imports por URL como "https://esm.sh/...". El resto del
// archivo ya evita cualquier import externo y solo usa fetch nativo; hacemos
// lo mismo acá pegándole directo a la API REST (PostgREST) que expone
// Supabase, sin librería de por medio.
function restHeaders(serviceKey: string): Record<string, string> {
  return {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

async function loadKeyHealth(): Promise<Map<number, number>> {
  const now = Date.now();
  if (healthCache && (now - healthCache.fetchedAt) < HEALTH_CACHE_TTL_MS) {
    return healthCache.blockedUntil;
  }
  const map = new Map<number, number>();
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const res = await fetch(
      `${url}/rest/v1/${KEY_HEALTH_TABLE}?select=key_index,blocked_until`,
      { headers: restHeaders(serviceKey) },
    );
    if (res.ok) {
      const rows = await res.json() as { key_index: number; blocked_until: string | null }[];
      for (const row of rows) {
        if (row.blocked_until) {
          const t = new Date(row.blocked_until).getTime();
          if (t > now) map.set(row.key_index, t);
        }
      }
    }
  } catch (_e) {
    // Si la tabla todavía no existe o falla la lectura, seguimos sin
    // bloqueos -- mejor eso que trabar el chat entero por esto.
  }
  healthCache = { blockedUntil: map, fetchedAt: now };
  return map;
}

function upsertKeyHealth(idx: number, blockedUntilIso: string | null): void {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // Fire-and-forget: esto no debe sumar latencia a la respuesta del chat.
  fetch(`${url}/rest/v1/${KEY_HEALTH_TABLE}?on_conflict=key_index`, {
    method: 'POST',
    headers: { ...restHeaders(serviceKey), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      key_index: idx,
      blocked_until: blockedUntilIso,
      updated_at: new Date().toISOString(),
    }]),
  }).then(() => {}, () => {});
}

function markKeyBlocked(idx: number, ms: number): void {
  if (!healthCache) healthCache = { blockedUntil: new Map(), fetchedAt: Date.now() };
  healthCache.blockedUntil.set(idx, Date.now() + ms);
  upsertKeyHealth(idx, new Date(Date.now() + ms).toISOString());
}

function clearKeyBlock(idx: number): void {
  if (healthCache?.blockedUntil.has(idx)) healthCache.blockedUntil.delete(idx);
  upsertKeyHealth(idx, null);
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
    // Timeout defensivo: volvemos a 12s (el valor original). Un valor más
    // corto (probé 6s) generaba falsos positivos -- Gemini a veces tarda
    // más de 6s en responder pero SÍ responde bien, y cortarlo antes de
    // tiempo lo hacía ver como "falla" sin serlo.
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
      // Error de red O timeout (AbortError): rotamos a la siguiente key
      // para ESTE mensaje nada más. A propósito NO persistimos un bloqueo
      // acá -- un timeout no es una señal confiable de que la key esté
      // agotada/inválida (puede ser Gemini lento en general, o un hipo de
      // red puntual), así que castigarla 5 min en la DB podía terminar
      // bloqueando las 4 keys en cascada por pura lentitud pasajera de
      // Google, no por un problema real de las keys.
      lastErrorText = String(networkErr);
      lastStatus = 0;
      console.warn(`Gemini key #${idx + 1}/${GEMINI_KEYS.length} (${keyHint}) falló por red o timeout (12s). Rotando a la siguiente...`);
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

    // SOLO 429 (cuota agotada) o 403 (permiso/credencial inválida) son
    // señales confiables y explícitas de Google de que la key no sirve por
    // un buen rato -- estas SÍ se persisten 24h (la cuota se resetea
    // diario). Cualquier otro status (500 de Google, etc.) es
    // probablemente transitorio y NO se persiste, para evitar el mismo
    // efecto cascada explicado arriba.
    if (lastStatus === 429 || lastStatus === 403) {
      markKeyBlocked(idx, 24 * 60 * 60 * 1000);
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
