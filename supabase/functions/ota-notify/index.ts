// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    console.log("Iniciando webhook OTA...");

    // 1. Verificación de la contraseña contra la variable de entorno
    //    (mismo SYNC_SECRET que usan forum-notify/sync-plytix/comunicado-notify).
    //    No va hardcodeada en el código para que no quede expuesta si el repo
    //    es público, y para poder rotarla sin tener que redeployar la función.
    const secret = req.headers.get('x-sync-secret') ?? '';
    const expected = Deno.env.get('SYNC_SECRET') ?? '';
    if (secret !== expected) {
      console.error("Error de contraseña. Recibido:", secret);
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supaAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log("Payload recibido. Tabla:", payload?.table);

    if (payload?.table !== 'version_apk' || !payload?.record) {
      console.log("Ignorado: No es version_apk o no hay record");
      return new Response(JSON.stringify({ ok: true, message: 'Tabla ignorada' }), { status: 200 });
    }

    const record = payload.record;
    console.log("Buscando usuarios desactualizados para la versión:", record.version_code);

    const { data: profiles, error: profilesError } = await supaAdmin
      .from('profiles')
      .select('expo_push_token')
      .not('expo_push_token', 'is', null)
      .or(`installed_version_code.lt.${record.version_code},installed_version_code.is.null`);

    if (profilesError) {
      console.error("Error consultando perfiles:", profilesError.message);
      return new Response(JSON.stringify({ error: profilesError.message }), { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokens = profiles.map((p: any) => p.expo_push_token);
    console.log("Cantidad de teléfonos a notificar:", tokens.length);

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'Todos están actualizados' }), { status: 200 });
    }

    const title = `Actualización disponible (v${record.version_name})`;
    const body = record.release_notes ? record.release_notes.substring(0, 150) : 'Toca aquí para iniciar la descarga.';
    const data = { type: 'update', action: 'update', versionCode: record.version_code };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunk = (arr: any[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
    
    let pushCount = 0;
    for (const batch of chunk(tokens, 100)) {
      const messages = batch.map(t => ({ to: t, sound: 'default', title, body, data }));
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        });
        
        console.log("Respuesta de Expo:", await res.text());
        pushCount += batch.length;
      } catch (e) {
        console.error('Error enviando a Expo:', String(e));
      }
    }

    console.log("Proceso terminado. Push enviados:", pushCount);
    return new Response(JSON.stringify({ ok: true, sent: pushCount }), { status: 200 });
  } catch (error) {
    console.error("Error fatal en la función:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});
