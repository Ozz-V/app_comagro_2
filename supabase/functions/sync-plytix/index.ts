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

let currentKeyIndex = 0;

function computeNextAttempt(retryCount: number): string {
  let delayMinutes = 0;
  if (retryCount <= 5) delayMinutes = 0;
  else if (retryCount <= 10) delayMinutes = 60;
  else if (retryCount <= 20) delayMinutes = 360;
  else delayMinutes = 1440;
  return new Date(Date.now() + delayMinutes * 60000).toISOString();
}

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
  let quotaSeenInThisRound = false; 

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
      currentKeyIndex = idx;
      return await res.json();
    }

    lastStatus = res.status;
    lastErrorText = await res.text();
    quotaSeenInThisRound = quotaSeenInThisRound || res.status === 429 || res.status === 403;

    const keyHint = key.length > 4 ? `...${key.slice(-4)}` : '(muy corta)';

    console.warn(`Gemini key #${idx + 1}/${keys.length} (${keyHint}) falló (status ${res.status}). Rotando a la siguiente...`);
    continue;
  }

  if (quotaSeenInThisRound) {
    const err = new Error(`Cuota agotada en las ${keys.length} key(s) de Gemini configuradas. Último error: ${lastErrorText}`);
    (err as Error & { status?: number }).status = 429;
    throw err;
  }
  const err = new Error(`Las ${keys.length} key(s) de Gemini configuradas fallaron (último status ${lastStatus}). Último error: ${lastErrorText}`);
  (err as Error & { status?: number }).status = lastStatus;
  throw err;
}

// ---------------------------------------------------------------------------
// NOTIFICACIONES PUSH AGRUPADAS (BATCH)
// ---------------------------------------------------------------------------
const NOTIFICATION_WINDOW_MINUTES = 60;

async function handleBatchedNotifications(
  // deno-lint-ignore no-explicit-any
  supaAdmin: any,
  newlyProcessedCount: number,
  remainingInQueue: number,
) {
  if (newlyProcessedCount <= 0) return;

  try {
    const { data: state } = await supaAdmin
      .from('notification_batch')
      .select('pending_count, window_started_at')
      .eq('id', 1)
      .maybeSingle();

    const now = new Date();
    const pendingCount = (state?.pending_count || 0) + newlyProcessedCount;
    const windowStart = state?.window_started_at ? new Date(state.window_started_at) : now;
    const windowAgeMinutes = (now.getTime() - windowStart.getTime()) / 60000;

    const queueDrained = remainingInQueue === 0;
    const windowExpired = windowAgeMinutes >= NOTIFICATION_WINDOW_MINUTES;

    if (!queueDrained && !windowExpired) {
      await supaAdmin.from('notification_batch').upsert({
        id: 1,
        pending_count: pendingCount,
        window_started_at: windowStart.toISOString(),
      });
      console.log(`Notificación en espera: ${pendingCount} producto(s) acumulados (cola: ${remainingInQueue} pendientes).`);
      return;
    }

    // --- MAGIA: OBTENER LOS SKUs EXACTOS DE ESTE BATCH PARA EL MODAL ---
    // Pedimos los últimos 'pendingCount' SKUs completados ordenados por actualización reciente.
    const { data: latestItems } = await supaAdmin
      .from('plytix_queue')
      .select('sku')
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(pendingCount);

    const batchedSkus = latestItems ? latestItems.map((item: { sku: string }) => item.sku) : [];

    const { data: profiles, error: profilesError } = await supaAdmin
      .from('profiles')
      .select('id, expo_push_token');

    if (profilesError) {
      console.error('Error leyendo perfiles para push:', profilesError.message);
      return;
    }

    const notifTitle = '¡Catálogo actualizado!';
    const notifBody = pendingCount === 1
      ? 'Se agregó o actualizó 1 producto. ¡Revisalo!'
      : `Se agregaron o actualizaron ${pendingCount} productos. ¡Revisalos!`;

    const profilesWithToken = (profiles || []).filter((p: { expo_push_token: string | null }) => !!p.expo_push_token);

    if (profilesWithToken.length > 0) {
      const pushMessages = profilesWithToken.map((prof: { expo_push_token: string }) => ({
        to: prof.expo_push_token,
        sound: 'default',
        title: notifTitle,
        body: notifBody,
        // AQUÍ INYECTAMOS LOS SKUs Y EL TIPO PARA QUE APP.TSX LO INTERCEPTE
        data: { type: 'new_products', count: pendingCount, skus: batchedSkus }, 
      }));

      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pushMessages),
      });

      let pushJson: unknown = null;
      try {
        pushJson = await pushRes.json();
      } catch (parseErr) {
        console.error('push_send_parse_error', String(parseErr));
      }

      if (!pushRes.ok) {
        console.error('push_send_http_error', pushRes.status, JSON.stringify(pushJson));
      } else if (pushJson && typeof pushJson === 'object' && Array.isArray((pushJson as { data?: unknown }).data)) {
        // deno-lint-ignore no-explicit-any
        const tickets = (pushJson as any).data as any[];
        const ticketErrors = tickets.filter(t => t?.status === 'error');
        if (ticketErrors.length > 0) {
          console.error('push_send_ticket_errors', JSON.stringify(ticketErrors));
        } else {
          console.log(`Push agrupado enviado OK a ${profilesWithToken.length} dispositivo(s), ${pendingCount} producto(s).`);
        }
      }
    } else {
      console.log('No hay dispositivos con token registrado, se omite el push.');
    }

    // Historial: agregamos los datos también para que se vean si hace falta en el log
    if (profiles && profiles.length > 0) {
      const logRows = profiles.map((p: { id: string }) => ({
        user_id: p.id,
        type: 'new_products', // Renombrado a new_products para consistencia
        title: notifTitle,
        body: notifBody,
        data: { type: 'new_products', count: pendingCount, skus: batchedSkus },
      }));
      const { error: logError } = await supaAdmin.from('notifications_log').insert(logRows);
      if (logError) {
        console.error('notifications_log_insert_error', logError.message);
      }
    }

    await supaAdmin.from('notification_batch').upsert({
      id: 1,
      pending_count: 0,
      window_started_at: null,
      last_sent_at: now.toISOString(),
    });
  } catch (err) {
    console.error('Error en el manejo de notificaciones agrupadas:', err);
  }
}

Deno.serve(async (req: Request) => {
  console.log('--- FUNCTION STARTED ---', req.method, req.url);
  try {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/health')) {
      return new Response(JSON.stringify({ status: 'ok', service: 'sync-plytix', timestamp: new Date().toISOString(), gemini_keys_configured: GEMINI_KEYS.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
      console.warn('Feed de Plytix vacío o sin productos nuevos. Saltando Ingesta y procediendo al procesamiento de cola.');
    } else {
      const sanitizedProducts = plytixData
        .filter(p => p.SKU && String(p.SKU).trim() !== '' && String(p.SKU).trim().toUpperCase() !== 'UNDEFINED' && String(p.SKU).trim().toUpperCase() !== 'NULL')
        .map(p => ({ sku: String(p.SKU).trim().toUpperCase(), raw_data: sanitizeUnicode(p) }));

      const existingData = new Map<string, { hash: string, status: string }>();
      const skuLookupChunkSize = 300;
      const allSkusInFeed = sanitizedProducts.map(p => p.sku);
      for (let i = 0; i < allSkusInFeed.length; i += skuLookupChunkSize) {
        const skuChunk = allSkusInFeed.slice(i, i + skuLookupChunkSize);
        const { data: existingRows, error: lookupError } = await supaAdmin
          .from('plytix_queue')
          .select('sku, content_hash, status')
          .in('sku', skuChunk);
        if (lookupError) {
          console.error('Error consultando hashes existentes:', lookupError.message);
          continue;
        }
        for (const row of existingRows || []) {
          if (row.content_hash) existingData.set(row.sku, { hash: row.content_hash, status: row.status || 'completed' });
        }
      }

      const upsertQueueData = [];
      for (const item of sanitizedProducts) {
        // Clonamos el objeto crudo para quitarle columnas irrelevantes antes de comparar
        const relevantData = { ...item.raw_data };
        for (const key of Object.keys(relevantData)) {
          if (key.toLowerCase().includes('imagen') || key.toLowerCase().includes('manual')) {
            delete relevantData[key];
          }
        }
        
        const newHash = await computeHash(relevantData);
        const oldData = existingData.get(item.sku);
        const oldHash = oldData?.hash;
        
        if (oldHash === newHash) {
          // El texto no cambió, NO disparamos la IA.
          // Pero SÍ guardamos el raw_data actualizado por si cambiaron solo las fotos.
          upsertQueueData.push({
            sku: item.sku,
            raw_data: item.raw_data, // Tiene las fotos nuevas
            content_hash: newHash,
            status: oldData?.status || 'completed', // Mantenemos su estado actual (no lo volvemos pending)
            updated_at: new Date().toISOString()
          });
          continue; 
        }
        
        // Si el hash cambió, significa que el texto cambió.
        // Lo mandamos a pending para que la IA regenere el Sales Pitch.
        upsertQueueData.push({
          sku: item.sku,
          raw_data: item.raw_data,
          content_hash: newHash,
          status: 'pending',
          retry_count: 0,
          next_attempt_at: new Date().toISOString(),
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
    } 

    const nowISO = new Date().toISOString();
    const { data: queueItems, error: qErr } = await supaAdmin
      .from('plytix_queue')
      .select('*')
      .eq('status', 'pending')
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowISO}`)
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

    for (const item of queueItems) {
       const sku = item.sku;
       const p = item.raw_data;
       try {
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

         const ignoreKeys = ['imagen', 'manual', 'marcación pim', 'material antiguo', 'despiece', 'denominador estandar', 'volumen', 'peso neto', 'thumbnail', 'ficha tecnica', 'ficha', 'video', 'gama', 'brand logo'];
         const specsList = [];
         for (const [key, val] of Object.entries(p)) {
             const kLower = key.toLowerCase();
             if (ignoreKeys.some(ik => kLower.includes(ik))) continue;
             if (!val || val === '' || val === '0' || val === '0.0' || val === '0.00' || val === '0.000' || val === 0 || val === 'N/A' || val === 'null' || val === '-') continue;
             specsList.push(`• **${key}:** ${val}`);
         }
         const cleanSpecsText = specsList.length > 0 ? `\n\n**Especificaciones Técnicas:**\n${specsList.join('\n')}` : '';

         const { error: insertError } = await supaAdmin.from('productos_ai_data').upsert({
            sku: sku,
            sales_pitch: `${salesPitch}${cleanSpecsText}`,
            embedding: embeddingVector,
            created_at: new Date().toISOString()
         }, { onConflict: 'sku' });

         if (insertError) throw insertError;

         await supaAdmin.from('plytix_queue').update({ status: 'completed', retry_count: 0, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('sku', sku);

         processedSkus.push(sku);

       } catch (err) {
         const status = (err as Error & { status?: number }).status;
         console.error(`Error procesando SKU ${sku}:`, (err as Error).message);
         errors.push({ sku, error: (err as Error).message });

         if (status === 429 || status === 403) {
           await supaAdmin.from('plytix_queue').update({
             status: 'pending',
             last_error: `${(err as Error).message} (esperando reset de cuota diaria, sin contar como reintento)`,
             updated_at: new Date().toISOString()
           }).eq('sku', sku);

           console.warn(`Cuota de Gemini agotada en las ${GEMINI_KEYS.length} key(s) configuradas, se corta el batch sin gastar reintentos.`);
           break;
         }

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

    const { count: remainingCount } = await supaAdmin.from('plytix_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending');

    await handleBatchedNotifications(supaAdmin, processedSkus.length, remainingCount || 0);

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
