// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// forum-notify
// ---------------------------------------------------------------------------
// Se dispara automáticamente via Database Webhook de Supabase cuando se
// inserta una fila nueva en `forum_topics` o `forum_comments`.
//
// - Tema nuevo (forum_topics)   -> notifica a TODOS los perfiles con
//   role = 'admin', salvo que el admin sea quien creó el tema.
// - Comentario nuevo (forum_comments) -> notifica solo al dueño del tema
//   (el user_id guardado en forum_topics), salvo que se esté comentando
//   a sí mismo.
//
// Usa el mismo secreto que sync-plytix (SYNC_SECRET) para no tener que
// configurar un secret nuevo en Supabase.

// deno-lint-ignore no-explicit-any
async function sendPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (tokens.length === 0) return;
  const messages = tokens.map(t => ({ to: t, sound: 'default', title, body, data }));

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch (e) {
    console.error('forum_push_parse_error', String(e));
  }

  if (!res.ok) {
    console.error('forum_push_http_error', res.status, JSON.stringify(json));
  } else if (json && typeof json === 'object' && Array.isArray((json as { data?: unknown }).data)) {
    // deno-lint-ignore no-explicit-any
    const tickets = (json as any).data as any[];
    const errors = tickets.filter(t => t?.status === 'error');
    if (errors.length > 0) console.error('forum_push_ticket_errors', JSON.stringify(errors));
  }
}

// Inserta el historial en notifications_log: una fila por destinatario,
// tenga o no token de push (así el historial en la app queda completo
// incluso si alguien todavía no aceptó las notificaciones push).
// deno-lint-ignore no-explicit-any
async function logNotifications(supaAdmin: any, userIds: string[], type: string, title: string, body: string, data: Record<string, unknown>) {
  if (userIds.length === 0) return;
  const rows = userIds.map(id => ({ user_id: id, type, title, body, data }));
  const { error } = await supaAdmin.from('notifications_log').insert(rows);
  if (error) console.error('notifications_log_insert_error', error.message);
}

Deno.serve(async (req: Request) => {
  try {
    // Auth check (mismo secreto que ya usa sync-plytix)
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Faltan variables de entorno de Supabase');
    }
    const supaAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // deno-lint-ignore no-explicit-any
    const payload: any = await req.json();
    const table = payload?.table;
    const record = payload?.record;

    if (!table || !record) {
      return new Response(JSON.stringify({ error: 'Payload inválido: falta table o record' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------
    // Caso 1: tema nuevo -> avisar a todos los admins (menos a quien lo creó)
    // -------------------------------------------------------------------
    if (table === 'forum_topics') {
      const { data: admins, error } = await supaAdmin
        .from('profiles')
        .select('id, expo_push_token')
        .eq('role', 'admin')
        .not('expo_push_token', 'is', null);

      if (error) {
        console.error('Error buscando admins:', error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      const recipients = (admins || []).filter((a: { id: string }) => a.id !== record.user_id);
      const tokens = recipients
        // deno-lint-ignore no-explicit-any
        .map((a: any) => a.expo_push_token)
        .filter(Boolean);

      const notifTitle = 'Nueva sugerencia';
      const notifBody = record.title ? `Nuevo tema: "${record.title}"` : 'Se creó un nuevo tema en Sugerencias.';

      await sendPush(tokens, notifTitle, notifBody, { type: 'forum_topic', topicId: record.id });
      await logNotifications(
        supaAdmin,
        recipients.map((a: { id: string }) => a.id),
        'forum_topic',
        notifTitle,
        notifBody,
        { topicId: record.id },
      );

      return new Response(JSON.stringify({ ok: true, notified: tokens.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------
    // Caso 2: comentario nuevo -> avisar solo al dueño del tema
    // -------------------------------------------------------------------
    if (table === 'forum_comments') {
      const { data: topic, error: topicError } = await supaAdmin
        .from('forum_topics')
        .select('id, user_id, title')
        .eq('id', record.topic_id)
        .maybeSingle();

      if (topicError || !topic) {
        console.error('Error buscando el tema del comentario:', topicError?.message);
        return new Response(JSON.stringify({ error: topicError?.message || 'Tema no encontrado' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      if (topic.user_id === record.user_id) {
        // El dueño comentó en su propio tema: no hace falta notificarlo
        return new Response(JSON.stringify({ ok: true, notified: 0, reason: 'self_comment' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      const { data: owner, error: ownerError } = await supaAdmin
        .from('profiles')
        .select('expo_push_token')
        .eq('id', topic.user_id)
        .maybeSingle();

      if (ownerError) {
        console.error('Error buscando el token del dueño del tema:', ownerError.message);
        return new Response(JSON.stringify({ error: ownerError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      const tokens = owner?.expo_push_token ? [owner.expo_push_token] : [];
      const notifTitle = 'Nuevo comentario';
      const notifBody = `Alguien comentó en tu tema "${topic.title}".`;

      await sendPush(tokens, notifTitle, notifBody, { type: 'forum_comment', topicId: topic.id });
      await logNotifications(supaAdmin, [topic.user_id], 'forum_comment', notifTitle, notifBody, { topicId: topic.id });

      return new Response(JSON.stringify({ ok: true, notified: tokens.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Tabla que no nos interesa (por si el webhook se configura mal)
    return new Response(JSON.stringify({ ok: true, message: 'Tabla no manejada', table }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('forum-notify error:', (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
