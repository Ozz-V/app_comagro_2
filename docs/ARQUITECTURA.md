# Manual de Arquitectura: App Comagro
Este documento describe la arquitectura técnica, módulos y flujos principales de la aplicación para guiar el desarrollo y mantenimiento del proyecto.

## 1. Stack Tecnológico (Frontend y Backend)
- **Frontend (APK):** React Native utilizando Expo (compilado vía `eas build`).
- **Navegación:** `react-navigation` (o similar en React Native) para las vistas (Login, Home, Perfil, Chat).
- **Backend (BaaS):** Supabase (PostgreSQL para datos, Auth para seguridad).
- **Inteligencia Artificial:** Google Gemini (2.5 Flash para inferencia, Embedding-2 para matemáticas vectoriales).
- **Lógica de Servidor:** Supabase Edge Functions (Deno / TypeScript).

## 2. Compilación y Publicación
- El proyecto se desarrolla usando `npx expo start`.
- Para generar la APK (Android) o AAB, se utiliza el servicio de compilación en la nube **EAS (Expo Application Services)** leyendo las configuraciones de `app.json` y `eas.json`.

## 3. Módulos y Flujo de la Aplicación

### A. Autenticación y Perfiles (Profiles)
- **Login:** Se usa `Supabase Auth`. Los usuarios inician sesión y reciben un JWT.
- **Profiles:** En la tabla `profiles` (o equivalente) se vincula el `user_id` de Auth con los datos del vendedor.
- El JWT se inyecta en los headers (`Authorization`) de todas las llamadas a las Edge Functions para identificar quién hace la petición.

### B. Gestión de Catálogo
- Los productos viven en `productos_ai_data`.
- Tienen un `sku`, precio, y un `sales_pitch` que fue limpiado de asteriscos para renderizarse como texto plano en las vistas (Views/Text de React Native).
- Todos los productos tienen vectores de 768 dimensiones para búsquedas matemáticas.

### C. Edge Functions
Existen varias Edge Functions alojadas en Supabase (`supabase/functions/`):
- `chat`: El motor principal de la IA.

### D. Asistente IA (El Chatbot)
El chatbot (`chat/index.ts`) usa un flujo híbrido ultra-optimizado:
1. **Memoria Corta:** La IA solo lee los últimos 4 mensajes del historial para no asfixiarse de tokens.
2. **Vía Rápida (Exact Match):** Si el vendedor escribe un código exacto (Ej. D-60), salta el proceso de IA y extrae el producto de la BD al instante.
3. **Traducción de Intenciones:** Gemini convierte la conversación humana en una orden de búsqueda corta (ej. "motor 2hp").
4. **Caché Vectorial:** Revisa si la intención ya existe en `search_embeddings_cache` para ahorrar latencia de red.
5. **Búsqueda Vectorial:** Usa el RPC `buscar_productos_ia` para encontrar la mayor similitud matemática en caso de no ser un SKU exacto.
6. **Strikes:** Si se preguntan temas prohibidos (deportes, cena), emite un `[STRIKE]`. Con 2 strikes, baneado por 12 horas.
7. **Aprendizaje:** Si el usuario aporta conocimiento nuevo de ventas, usa `[LEARN: regla]` para inyectarlo en `ai_company_knowledge`.

## 4. Reglas Críticas para Modificaciones
- **No romper el motor de Chat:** Mantener la respuesta por debajo de los 3 segundos. Respetar la salida de etiquetas `[SKU: XXX]`.
- **Límites de Tokens:** El Extractor de Intenciones debe usar `maxOutputTokens: 150` para permitir "pensar" sin colapsos.
- **React Native:** Las modificaciones visuales de la App deben ajustarse al estilo de React Native (Flexbox) sin requerir librerías externas pesadas si no es estrictamente necesario.
