// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  try { json = await res.json(); } catch (e) {}
}

async function logNotifications(supaAdmin: any, userIds: string[], type: string, title: string, body: string, data: Record<string, unknown>) {
  if (userIds.length === 0) return;
  const rows = userIds.map(id => ({ user_id: id, type, title, body, data }));
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
    const record = payload?.record;

    if (!table || !record) return new Response(JSON.stringify({ error: 'Falta table o record' }), { status: 400 });

    // Obtenemos a todos los admins
    const { data: admins } = await supaAdmin.from('profiles').select('id, expo_push_token').eq('role', 'admin');
    const adminProfiles = admins || [];

    if (table === 'forum_topics') {
      const recipients = adminProfiles.filter((a: any) => a.id !== record.user_id);
      const tokens = recipients.map((a: any) => a.expo_push_token).filter(Boolean);
      
      const notifTitle = 'Nueva sugerencia';
      const notifBody = record.title ? "Nuevo tema: " + record.title : 'Se cre un nuevo tema en Sugerencias.';

      await sendPush(tokens, notifTitle, notifBody, { type: 'forum_topic', topicId: record.id });
      await logNotifications(supaAdmin, recipients.map((a: any) => a.id), 'forum_topic', notifTitle, notifBody, { topicId: record.id });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (table === 'forum_comments' || table === 'forum_topic_votes') {
      const { data: topic } = await supaAdmin.from('forum_topics').select('id, user_id, title').eq('id', record.topic_id).single();
      if (!topic) return new Response(JSON.stringify({ error: 'Tema no encontrado' }), { status: 500 });

      const actorId = record.user_id; // Quién hizo el comentario o like
      
      let targetUserIds = new Set<string>();
      
      // Añadimos a todos los admins (que no sean el actor)
      adminProfiles.forEach((a: any) => { if (a.id !== actorId) targetUserIds.add(a.id); });
      
      // Añadimos al dueño del tema (si no es el actor)
      if (topic.user_id !== actorId) targetUserIds.add(topic.user_id);
      
      if (targetUserIds.size === 0) return new Response(JSON.stringify({ ok: true, reason: 'Nadie a notificar' }), { status: 200 });

      // Buscamos los tokens de los que hay que notificar
      const { data: targetProfiles } = await supaAdmin.from('profiles').select('id, expo_push_token').in('id', Array.from(targetUserIds));
      const profiles = targetProfiles || [];
      const tokens = profiles.map((p: any) => p.expo_push_token).filter(Boolean);
      
      let notifTitle = '';
      let notifBody = '';
      
      if (table === 'forum_comments') {
        notifTitle = 'Nuevo comentario';
        notifBody = Hay un nuevo comentario en el tema " + topic.title + ";
      } else {
        notifTitle = 'Nueva reacción';
        const isUpvote = record.vote_type === 1;
        notifBody = Alguien dio  + (isUpvote ? 'Me gusta' : 'No me gusta') +  al tema " + topic.title + ";
      }

      await sendPush(tokens, notifTitle, notifBody, { type: 'forum_topic', topicId: topic.id });
      await logNotifications(supaAdmin, profiles.map((p: any) => p.id), 'forum_topic', notifTitle, notifBody, { topicId: topic.id });

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true, message: 'Tabla no manejada' }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});
