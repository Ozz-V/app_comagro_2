# Comagro App

Aplicación B2B diseñada para el equipo de ventas de Comagro (Chacomer). Permite explorar el catálogo completo de productos, generar fichas técnicas corporativas en PDF, e interactuar con un Asistente basado en LLMs para búsquedas complejas.

## Stack Tecnológico

- **Frontend:** React Native (Expo)
- **Base de Datos Local:** `expo-sqlite`
- **Backend (BaaS):** Supabase (PostgreSQL, Auth, Edge Functions)
- **PIM:** Plytix

## Instalación y Desarrollo Local

1. **Clonar el Repositorio:**
   ```bash
   git clone https://github.com/Ozz-V/app_comagro_2.git
   cd app_comagro_2
   ```

2. **Instalar Dependencias:**
   ```bash
   npm install
   ```

3. **Configurar el entorno:**
   Crear un archivo `.env` en la raíz del proyecto (no versionado) con las variables necesarias:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=tu_url_aqui
   EXPO_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
   EXPO_PUBLIC_EDGE_URL=tu_edge_url_aqui
   ```

4. **Ejecutar en Entorno de Desarrollo (Expo Go / Emulador):**
   ```bash
   npx expo start
   ```

5. **Linter y Tests:**
   ```bash
   npm run lint
   npm test
   ```

6. **Compilación (Cloud Build con EAS):**
   ```bash
   eas build --profile preview --platform android
   ```

## Sincronización de Catálogo

El catálogo se alimenta desde Plytix hacia Supabase mediante tareas programadas (Cronjobs). La aplicación móvil realiza una sincronización en segundo plano con la base de datos de Supabase para mantener el catálogo local actualizado (SQLite), permitiendo búsquedas rápidas incluso con mala conectividad.

---
**© Chacomer SAE.** Todos los derechos reservados. Uso exclusivo interno corporativo.
