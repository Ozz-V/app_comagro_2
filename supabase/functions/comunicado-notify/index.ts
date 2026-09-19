// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// comunicado-notify
// =============================================================================
// Se dispara con un Database Webhook de Supabase configurado asi (Dashboard ->
// Database -> Webhooks): tabla public.app_comunicados, evento INSERT, header
// "x-sync-secret: <SYNC_SECRET>" -> POST a esta funcion. Es el mismo patron
// que ya usan forum_topics/forum_comments contra forum-notify, asi que si esos
// webhooks ya existen en el proyecto, este solo hay que agregarlo al lado.
//
// Que hace: toma el comunicado recien insertado y le manda un push (mismo
// canal Expo que ya usan forum-notify y sync-plytix) solo a los destinatarios
// correctos:
//   - Si el comunicado tiene target_user_ids -> SOLO esos usuarios (comunicado
//     personalizado, ej. saludo de cumpleaños), sin importar su version.
//   - Si no, segun target_scope:
//       'all'      -> todos los que tengan expo_push_token
//       'latest'   -> installed_version_code >= target_version_code
//       'previous' -> installed_version_code <  target_version_code
//     (usuarios que todavia no reportaron installed_version_code -osea que no
//     actualizaron a una app que ya tenga este cambio- quedan afuera de
//     'latest'/'previous' hasta que actualicen; en 'all' si les llega igual).
//
// Comunicados programados a futuro (created_at > ahora, ver AdminPushScreen /
// "Publicar inmediatamente") NO disparan push todavia: se insertan igual en la
// tabla pero esta funcion los ignora hasta que alguien los reinserte o corra
// un proceso aparte en la fecha correspondiente. Por ahora solo cubre el envio
// inmediato, que es el caso de uso pedido.
// =============================================================================

type TargetScope = 'all' | 'latest' | 'previous';

interface ComunicadoRecord {
  id: string;
  tipo: string;
  titulo: string;
  contenido: string;
  is_active: boolean;
  created_at: string;
  target_scope: TargetScope | null;
  target_version_code: number | null;
  target_user_ids: string[] | null;
}

// Limpia el markdown simple que usa RichTextEditorModal (negrita, cursiva,
// subrayado, encabezados, links) para que el cuerpo del push no muestre
// simbolos sueltos como ** o #.
function stripMarkdown(text: string): string {
  return text
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[*_#`~]/g, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (tokens.length === 0) return;
  // Expo recomienda no mandar mas de ~100 mensajes por request.
  for (const batch of chunk(tokens, 100)) {
    const messages = batch.map(t => ({ to: t, sound: 'default', title, body, data }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      await res.json().catch(() => null);
    } catch (e) {
      console.error('comunicado_push_batch_error', String(e));
    }
  }
}

async function logNotifications(supaAdmin: any, userIds: string[], title: string, body: string, data: Record<string, unknown>) {
  if (userIds.length === 0) return;
  const rows = userIds.map(id => ({ user_id: id, type: 'comunicado', title, body, data }));
  await supaAdmin.from('notifications_log').insert(rows);
}

Deno.serve(async (req: Request) => {
  try {
    const secret = req.headers.get('x-sync-secret') ?? '';
    const expected = Deno.env.get('SYNC_SECRET') ?? '';
    if (secret !== expected) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supaAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const payload: any = await req.json();
    const table = payload?.table;
    const record: ComunicadoRecord | undefined = payload?.record;

    if (table !== 'app_comunicados' || !record) {
      return new Response(JSON.stringify({ ok: true, message: 'Tabla no manejada' }), { status: 200 });
    }

    if (!record.is_active) {
      return new Response(JSON.stringify({ ok: true, reason: 'Comunicado inactivo' }), { status: 200 });
    }

    // Programado a futuro: todavia no hay que avisarle a nadie.
    if (new Date(record.created_at).getTime() > Date.now()) {
      return new Response(JSON.stringify({ ok: true, reason: 'Comunicado programado, se omite el push por ahora' }), { status: 200 });
    }

    let recipientsQuery = supaAdmin.from('profiles').select('id, expo_push_token');

    if (record.target_user_ids && record.target_user_ids.length > 0) {
      recipientsQuery = recipientsQuery.in('id', record.target_user_ids);
    } else if (record.target_scope === 'latest' && record.target_version_code != null) {
      recipientsQuery = recipientsQuery.gte('installed_version_code', record.target_version_code);
    } else if (record.target_scope === 'previous' && record.target_version_code != null) {
      recipientsQuery = recipientsQuery.lt('installed_version_code', record.target_version_code);
    }
    // target_scope 'all' (o nulo/legado) -> sin filtro extra, todos los perfiles.

    const { data: profiles, error: profilesError } = await recipientsQuery;
    if (profilesError) {
      return new Response(JSON.stringify({ error: profilesError.message }), { status: 500 });
    }

    const withToken = (profiles || []).filter((p: { expo_push_token: string | null }) => !!p.expo_push_token);
    const tokens = withToken.map((p: { expo_push_token: string }) => p.expo_push_token);

    const title = record.titulo;
    const body = truncate(stripMarkdown(record.contenido || ''), 150);
    
    // Detectamos si el comunicado es de actualización
    const isUpdate = record.tipo === 'update' || 
                     record.tipo === 'actualizacion' || 
                     record.titulo.toLowerCase().includes('actualizaci');

    const data: Record<string, unknown> = { 
      type: 'comunicado', 
      comunicadoId: record.id 
    };

    if (isUpdate) {
      data.action = 'update';
    }

    await sendPush(tokens, title, body, data);
    await logNotifications(supaAdmin, withToken.map((p: { id: string }) => p.id), title, body, data);

    return new Response(JSON.stringify({ ok: true, sent: tokens.length }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});
