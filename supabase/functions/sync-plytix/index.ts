// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLYTIX_URL = Deno.env.get('PLYTIX_CHANNEL_URL') ?? 'https://pim.plytix.com/channels/69b2c94b558d8c2b27901090/feed';

// Limpia surrogates Unicode sueltos (no emparejados). Datos corruptos que vienen del feed
// de Plytix (texto copiado de PDFs/Excel con símbolos mal codificados) generan estos
// caracteres inválidos, y Postgres los rechaza al guardarlos en una columna jsonb con
// el error "unsupported Unicode escape sequence".
// deno-lint-ignore no-explicit-any
function sanitizeUnicode(value: any): any {
  if (typeof value === 'string') {
    return value
      // deno-lint-ignore no-control-regex
      .replace(/\u0000/g, '') // Postgres no permite el carácter NUL en jsonb/text bajo ninguna circunstancia
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, ''); // surrogates sueltos
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeUnicode);
  }
  if (value && typeof value === 'object') {
    // deno-lint-ignore no-explicit-any
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeUnicode(v);
    }
    return out;
  }
  return value;
}

// Genera un string estable (claves ordenadas) para poder comparar contenido de forma
// consistente sin importar el orden en que Plytix mande las propiedades del producto.
// deno-lint-ignore no-explicit-any
function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

// Hash SHA-256 del contenido del producto. Se usa para distinguir un cambio REAL
// (Plytix modificó algo) de que Plytix simplemente vuelva a mandar el mismo delta
// en la siguiente lectura del cron, antes del próximo "Process". Sin esto, cada
// corrida del cron reseteaba a 'pending' productos ya 'completed' sin que hubiera
// cambiado nada, deshaciendo el trabajo hecho en loop.
// deno-lint-ignore no-explicit-any
async function computeHash(value: any): Promise<string> {
  const data = new TextEncoder().encode(stableStringify(value));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// ROTACIÓN DE API KEYS DE GEMINI
// ---------------------------------------------------------------------------
// Definí en los secrets de Supabase la variable GEMINI_API_KEYS con TODAS las
// keys separadas por coma, por ejemplo:
//   GEMINI_API_KEYS = "AIzaSy_cuenta1,AIzaSy_cuenta2,AIzaSy_cuenta3"
// Podés poner 1, 3, 10 o las que quieras: el código nunca hay que tocarlo,
// solo agregar/quitar keys de esa variable.
//
// (Por compatibilidad, si no existe GEMINI_API_KEYS pero sí existe la vieja
// GEMINI_API_KEY con una sola key, también funciona igual.)
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

const GEMINI_KEYS = loadGeminiKeys();

// Índice de la "key actual". Vive a nivel de módulo: si la instancia de Deno
// se reutiliza entre corridas de cron (lo usual), la próxima corrida arranca
// directo en la key que sabíamos que todavía tenía cupo, en vez de volver a
// probar desde la key #1 y perder llamadas contra cuentas ya agotadas.
let currentKeyIndex = 0;

// BACKOFF EXPONENCIAL: cuantas más veces falla un producto, más se espacía su
// próximo intento. Así un producto con un problema real (no transitorio) deja
// de competir cada 5 minutos por un lugar en el batch contra productos sanos,
// pero JAMÁS deja de reintentarse -- el día que el problema se resuelva solo,
// en su próximo intento programado se procesa normal, sin que nadie lo toque.
// - Intentos 1 a 5: reintenta en la próxima corrida del cron (~5 min) -- para
//   agarrar rápido los problemas transitorios (un timeout, un 500 puntual).
// - Intentos 6 a 10: espera 1 hora entre intentos.
// - Intentos 11 a 20: espera 6 horas entre intentos.
// - Intentos 21 en adelante: espera 24 horas entre intentos, indefinidamente.
function computeNextAttempt(retryCount: number): string {
  let delayMinutes = 0;
  if (retryCount <= 5) delayMinutes = 0;
  else if (retryCount <= 10) delayMinutes = 60;
  else if (retryCount <= 20) delayMinutes = 360;
  else delayMinutes = 1440;
  return new Date(Date.now() + delayMinutes * 60000).toISOString();
}

// Hace un POST a Gemini probando la key actual. Si esa key falla por CUALQUIER
// motivo (429 cuota, 403 permiso, 401 credencial inválida, 500 de Google, o
// cualquier error que hoy no conocemos), rota automáticamente a la siguiente
// key de la lista y reintenta la MISMA llamada — nunca asumimos que "todas
// las keys van a fallar igual", así que siempre les damos la oportunidad a
// las demás antes de rendirnos.
// Si se agotan TODAS las keys disponibles, lanza un error clasificado:
// - status 429 si en el camino vimos algún error de cuota (para no gastar
//   reintentos y esperar el reset diario).
// - el status real (401, 500, etc.) si fue otro tipo de problema en las N
//   keys, para que quede el reintento genérico normal.
async function fetchGeminiWithRotation(
  keys: string[],
  buildRequest: (key: string) => { url: string; body: unknown },
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  if (keys.length === 0) {
    throw new Error('No hay API keys de Gemini configuradas.');
  }

  let lastErrorText = '';
  let lastStatus = 500;
  let quotaSeenInThisRound = false; // true si ALGUNA de las keys probadas falló por cuota (429/403)

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (currentKeyIndex + attempt) % keys.length;
    const key = keys[idx];
    const { url, body } = buildRequest(key);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      lastErrorText = String(networkErr);
      lastStatus = 0;
      console.warn(`Gemini key #${idx + 1}/${keys.length} falló por red. Rotando...`);
      continue;
    }

    if (res.ok) {
      currentKeyIndex = idx; // esta key sirvió, la dejamos "fijada" para la próxima llamada
      return await res.json();
    }

    lastStatus = res.status;
    lastErrorText = await res.text();
    quotaSeenInThisRound = quotaSeenInThisRound || res.status === 429 || res.status === 403;

    // Últimos 4 caracteres de la key para poder identificarla en los logs sin
    // exponer la key completa (que quede visible en Supabase Logs).
    const keyHint = key.length > 4 ? `...${key.slice(-4)}` : '(muy corta)';

    // Rotamos ante CUALQUIER error, sea el código que sea (429 cuota, 403
    // permiso, 401 credencial inválida, 500 de Google, o algo que hoy ni
    // siquiera existe todavía). No tiene sentido decidir de antemano cuáles
    // errores "merecen" rotar: si una key falla por lo que sea, simplemente
    // probamos la siguiente. Recién si las 4 keys fallan, más abajo,
    // decidimos qué tipo de problema fue.
    console.warn(`Gemini key #${idx + 1}/${keys.length} (${keyHint}) falló (status ${res.status}). Rotando a la siguiente...`);
    continue;
  }

  // Se probaron TODAS las keys de la lista y ninguna funcionó. Clasificamos
  // el motivo para que el resto del código sepa cómo reaccionar:
  // - Si en ALGUNA de las keys vimos 429/403 (cuota), tratamos todo el fallo
  //   como "cuota agotada" -> no tiene sentido gastar reintentos, hay que
  //   esperar el reset diario.
  // - Si no, es otro tipo de problema (401 en las 4, 500 en las 4, etc.) ->
  //   se maneja como un error genérico retryable, y va quedando registrado
  //   en last_error para poder revisarlo.
  if (quotaSeenInThisRound) {
    const err = new Error(`Cuota agotada en las ${keys.length} key(s) de Gemini configuradas. Último error: ${lastErrorText}`);
    (err as Error & { status?: number }).status = 429;
    throw err;
  }
  const err = new Error(`Las ${keys.length} key(s) de Gemini configuradas fallaron (último status ${lastStatus}). Último error: ${lastErrorText}`);
  (err as Error & { status?: number }).status = lastStatus;
  throw err;
}

Deno.serve(async (req: Request) => {
  try {
    // Health check
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/health')) {
      return new Response(JSON.stringify({ status: 'ok', service: 'sync-plytix', timestamp: new Date().toISOString(), gemini_keys_configured: GEMINI_KEYS.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Auth check: comparación constant-time para evitar ataques de timing
    const secret = req.headers.get('x-sync-secret') ?? '';
    const expected = Deno.env.get('SYNC_SECRET') ?? '';
    let mismatch = secret.length !== expected.length ? 1 : 0;
    const len = Math.max(secret.length, expected.length);
    for (let i = 0; i < len; i++) {
      mismatch |= (secret.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
    }
    if (mismatch !== 0) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    if (!supabaseUrl || !supabaseServiceKey || GEMINI_KEYS.length === 0) {
      throw new Error('Faltan variables de entorno (Supabase o GEMINI_API_KEYS)');
    }

    const supaAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Obtener todos los productos de Plytix (Fallback de caché)
    let text = '';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(PLYTIX_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Plytix HTTP Error: ${res.status}`);
      text = await res.text();
    } catch (err) {
      console.warn('Fallback: Plytix feed inaccesible', err);
      return new Response(JSON.stringify({ error: 'Feed de Plytix inaccesible temporalmente', fallback: true, details: (err as Error).message }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    // deno-lint-ignore no-explicit-any
    let plytixData: any[] = [];
    try {
      const parsed = JSON.parse(text);
      plytixData = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      plytixData = text.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(l => {
          try { return JSON.parse(l); } catch { return null; }
        })
        .filter(Boolean);
    }

    if (!plytixData.length) {
      return new Response(JSON.stringify({ error: 'Feed vacío o inválido' }), { status: 400 });
    }

    // PASO A: INGESTA INSTANTANEA
    // Guardamos en la cola solo lo que REALMENTE cambió. Plytix repite el mismo delta
    // en cada lectura hasta el próximo "Process" (puede ser cada varias horas), así que
    // si comparáramos por SKU nomás y reseteáramos siempre a 'pending', cada corrida del
    // cron (cada 5 min) volvería a resetear productos que ya se completaron minutos antes,
    // sin que haya cambiado nada real. Por eso comparamos un hash del contenido:
    // - SKU nuevo → se inserta como 'pending'.
    // - SKU existente con el MISMO hash → no se toca (Plytix repitió el mismo delta).
    // - SKU existente con hash DISTINTO → cambio real, se actualiza raw_data y vuelve a 'pending'.
    const sanitizedProducts = plytixData
      .filter(p => p.SKU && String(p.SKU).trim() !== '' && String(p.SKU).trim().toUpperCase() !== 'UNDEFINED' && String(p.SKU).trim().toUpperCase() !== 'NULL')
      .map(p => ({ sku: String(p.SKU).trim().toUpperCase(), raw_data: sanitizeUnicode(p) }));

    // Traemos sku + content_hash existentes, solo para los SKUs de este feed (no toda la tabla),
    // paginado en lotes para no toparnos con límites de URL en el .in().
    const existingHashes = new Map<string, string>();
    const skuLookupChunkSize = 300;
    const allSkusInFeed = sanitizedProducts.map(p => p.sku);
    for (let i = 0; i < allSkusInFeed.length; i += skuLookupChunkSize) {
      const skuChunk = allSkusInFeed.slice(i, i + skuLookupChunkSize);
      const { data: existingRows, error: lookupError } = await supaAdmin
        .from('plytix_queue')
        .select('sku, content_hash')
        .in('sku', skuChunk);
      if (lookupError) {
        console.error('Error consultando hashes existentes:', lookupError.message);
        continue;
      }
      for (const row of existingRows || []) {
        if (row.content_hash) existingHashes.set(row.sku, row.content_hash);
      }
    }

    const upsertQueueData = [];
    for (const item of sanitizedProducts) {
      const newHash = await computeHash(item.raw_data);
      const oldHash = existingHashes.get(item.sku);
      if (oldHash === newHash) continue; // sin cambios reales, no tocar la fila
      upsertQueueData.push({
        sku: item.sku,
        raw_data: item.raw_data,
        content_hash: newHash,
        status: 'pending',
        retry_count: 0, // cambio real de contenido -> merece intentos frescos
        next_attempt_at: new Date().toISOString(), // disponible ya, sin arrastrar backoff de fallos viejos
        updated_at: new Date().toISOString()
      });
    }

    if (upsertQueueData.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < upsertQueueData.length; i += chunkSize) {
        const chunk = upsertQueueData.slice(i, i + chunkSize);
        const { error: queueError } = await supaAdmin
          .from('plytix_queue')
          .upsert(chunk, { onConflict: 'sku' });
        if (queueError) {
          console.error('Error insertando en plytix_queue:', queueError.message);
        }
      }
    }

    // PASO B: PROCESAMIENTO SEGURO
    // Tomamos un lote (batch) de máximo 10 productos que estén 'pending' Y cuyo
    // momento programado de reintento (next_attempt_at) ya haya llegado. Así los
    // productos que vienen fallando mucho (backoff largo) no le quitan lugar en
    // el batch a productos sanos o recién ingresados.
    const { data: queueItems, error: qErr } = await supaAdmin
      .from('plytix_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .order('updated_at', { ascending: true })
      .limit(10);

    if (qErr) {
        throw new Error(`Error leyendo la cola: ${qErr.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
       return new Response(JSON.stringify({ message: 'Todo está sincronizado. No hay productos pendientes en la cola.', processed: 0 }), { status: 200 });
    }

    const processedSkus: string[] = [];
    const errors = [];

    // Procesar cada producto del lote
    for (const item of queueItems) {
       const sku = item.sku;
       const p = item.raw_data;
       try {
         // a) Generar el Sales Pitch con IA (con rotación automática de keys de Gemini)
         const productContext = JSON.stringify(p, null, 2);
         const prompt = `Eres un redactor experto en herramientas técnicas y agrícolas.
Aquí tienes las especificaciones en bruto de un producto:
${productContext}

Escribe una descripción comercial y técnica (sales pitch) de EXACTAMENTE 1 párrafo para este producto (máximo 5 a 6 líneas). Resalta sus usos principales y características clave. Usa un tono vendedor pero profesional. No uses Markdown, solo texto plano. NO incluyas el código SKU en el texto. Empieza directamente con la descripción.`;

         const generateData = await fetchGeminiWithRotation(GEMINI_KEYS, () => ({
           url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`,
           body: {
             contents: [{ role: 'user', parts: [{ text: prompt }] }],
             generationConfig: { maxOutputTokens: 2000, temperature: 0.3 }
           }
         }));
         let salesPitch = generateData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Producto técnico de alta calidad.';
         salesPitch = salesPitch.replace(/\*\*/g, '');

         // b) Generar los Embeddings (Vectores) para la búsqueda semántica usando las especificaciones reales
         const nombreProd = p['Nombre del Producto'] || p['Brand'] || sku;
         const specsText = Object.entries(p)
            .filter(([k,v]) => v && String(v).trim() !== '' && !k.toLowerCase().includes('imagen') && !k.toLowerCase().includes('manual'))
            .map(([k,v]) => `${k}: ${v}`)
            .join(', ');

         const embedText = `Producto: ${nombreProd}. Especificaciones: ${specsText}. Descripción general: ${salesPitch}`;

         const embedData = await fetchGeminiWithRotation(GEMINI_KEYS, () => ({
           url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`,
           body: {
             model: 'models/gemini-embedding-2',
             content: { parts: [{ text: embedText }] },
             outputDimensionality: 768,
             taskType: "RETRIEVAL_DOCUMENT"
           }
         }));
         const embeddingVector = embedData.embedding.values;

         // c) Formatear especificaciones de manera limpia para el bot
         const ignoreKeys = ['imagen', 'manual', 'marcación pim', 'material antiguo', 'despiece', 'denominador estandar', 'volumen', 'peso neto', 'thumbnail', 'ficha tecnica', 'ficha', 'video', 'gama', 'brand logo'];
         const specsList = [];
         for (const [key, val] of Object.entries(p)) {
             const kLower = key.toLowerCase();
             if (ignoreKeys.some(ik => kLower.includes(ik))) continue;
             if (!val || val === '' || val === '0' || val === '0.0' || val === '0.00' || val === '0.000' || val === 0 || val === 'N/A' || val === 'null' || val === '-') continue;
             specsList.push(`• **${key}:** ${val}`);
         }
         const cleanSpecsText = specsList.length > 0 ? `\n\n**Especificaciones Técnicas:**\n${specsList.join('\n')}` : '';

         // d) Guardar en la base de datos Supabase (usando upsert para soportar modificaciones)
         const { error: insertError } = await supaAdmin.from('productos_ai_data').upsert({
            sku: sku,
            sales_pitch: `${salesPitch}${cleanSpecsText}`,
            embedding: embeddingVector,
            created_at: new Date().toISOString()
         }, { onConflict: 'sku' });

         if (insertError) throw insertError;

         // e) Marcar como completado en la cola
         await supaAdmin.from('plytix_queue').update({ status: 'completed', retry_count: 0, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('sku', sku);

         processedSkus.push(sku);

       } catch (err) {
         const status = (err as Error & { status?: number }).status;
         console.error(`Error procesando SKU ${sku}:`, (err as Error).message);
         errors.push({ sku, error: (err as Error).message });

         // Caso especial: se agotaron las 4 (o las que sean) keys de Gemini por
         // CUOTA DIARIA. Esto no es un error puntual como un timeout o un 500 —
         // es 100% seguro que va a volver a fallar en la próxima corrida del cron
         // hasta que Google resetee la cuota al otro día. Por eso NO gastamos
         // retry_count acá ni aplicamos backoff: el producto queda 'pending'
         // esperando tranquilo, y el propio cron (cada 5 min) lo va a reintentar
         // solo hasta que en algún momento ya haya cupo de nuevo -- queremos
         // agarrar el reset apenas ocurra, no esperar 1 hora de más.
         if (status === 429 || status === 403) {
           await supaAdmin.from('plytix_queue').update({
             status: 'pending',
             last_error: `${(err as Error).message} (esperando reset de cuota diaria, sin contar como reintento)`,
             updated_at: new Date().toISOString()
           }).eq('sku', sku);

           console.warn(`Cuota de Gemini agotada en las ${GEMINI_KEYS.length} key(s) configuradas, se corta el batch sin gastar reintentos.`);
           break;
         }

         // Reintento genérico para cualquier otro tipo de error (500, 503, fallos
         // de red, error insertando en Supabase, etc.). A PRUEBA DE ERRORES: no
         // importa cuál sea el problema ni cuántas veces falle, NUNCA lo abandonamos
         // marcándolo 'error' de forma permanente. Siempre vuelve a 'pending', pero
         // con BACKOFF: cuantas más veces falla, más se espacía su próximo intento
         // (ver computeNextAttempt), así no le saca lugar en el batch a productos
         // sanos. El cron lo sigue reintentando solo, cada vez más espaciado, para
         // siempre -- hasta que el problema se resuelva, sin que nadie tenga que
         // entrar a mano a resetearlo por SQL.
         const newRetryCount = (item.retry_count || 0) + 1;

         await supaAdmin.from('plytix_queue').update({
           status: 'pending',
           retry_count: newRetryCount,
           next_attempt_at: computeNextAttempt(newRetryCount),
           last_error: `${(err as Error).message} (intento #${newRetryCount})`,
           updated_at: new Date().toISOString()
         }).eq('sku', sku);
       }
    }

    // 6. Enviar notificaciones push si hubo productos procesados exitosamente
    if (processedSkus.length > 0) {
      try {
        const { data: profiles } = await supaAdmin.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null);
        if (profiles && profiles.length > 0) {
          const pushMessages = profiles.map(prof => ({
            to: prof.expo_push_token,
            sound: 'default',
            title: '¡Nuevo Producto o Actualización!',
            body: `Se han procesado ${processedSkus.length} producto(s) en el catálogo, incluyendo SKU: ${processedSkus[0]}. ¡Revisalo!`,
            data: { skus: processedSkus },
          }));

          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pushMessages),
          });
        }
      } catch (err) {
        console.error('Error enviando push notifications:', err);
      }
    }

    // Contar cuántos quedan pendientes en la cola total
    const { count: remainingCount } = await supaAdmin.from('plytix_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending');

    return new Response(JSON.stringify({
        message: 'Lote procesado exitosamente',
        processed_count: processedSkus.length,
        processed_skus: processedSkus,
        remaining_in_queue: remainingCount || 0,
        gemini_keys_configured: GEMINI_KEYS.length,
        errors
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
