# Chat Tester (herramienta interna, NO productiva)

Página HTML standalone para probar manualmente el prompt/comportamiento de la
IA del chat contra la Edge Function **`chat-test`** (la copia de pruebas,
nunca `chat`, que es la que usa la app en producción).

## Qué es y qué no es
- **Es**: un banco de pruebas rápido para iterar el prompt del asesor de
  ventas sin tener que compilar la app ni pasar por el flujo de login.
- **No es**: parte del build de la APK. No se referencia desde ningún
  workflow de CI/CD, `app.json` ni `package.json`. Podés borrar esta carpeta
  entera y la app y la web siguen funcionando exactamente igual.

## Cómo usarlo
1. Abrí `index.html` directamente en el navegador (doble clic, o `Live
   Server` de VSCode).
2. Pegá la URL de tu proyecto Supabase y la **Anon Key** (la misma que usás
   en `EXPO_PUBLIC_SUPABASE_ANON_KEY` de tu `.env`).
3. Escribí mensajes como si fueras un vendedor probando el chat.

## Reglas de seguridad (léelo antes de tocar esto)
- **Nunca** pegues acá la `SERVICE_ROLE_KEY` — esta herramienta solo necesita
  la Anon Key (pública, protegida por RLS). Si alguna vez sentís que
  necesitás la service role acá, es señal de que el bug que estás
  investigando debe resolverse en la Edge Function, no en este archivo.
- No commitees capturas de pantalla ni grabaciones donde se vea la Anon Key
  tipeada (aunque no sea "secreta" en el sentido estricto, mejor no
  regalar pistas de infraestructura innecesariamente).
- Esta página nunca guarda nada en `localStorage`/`sessionStorage`/disco: al
  cerrar la pestaña, la key ingresada se pierde. Es intencional.
- Si necesitás una herramienta de testing que SÍ corra en CI de forma
  automatizada, ver `scripts/manual-checks/chat_tests.js` (ese sí requiere
  variables de entorno via `TEST_EMAIL`/`TEST_PASSWORD`/`SUPABASE_ANON_KEY`,
  pensado para correr desde terminal, no desde el navegador).
