# Comagro App 🚀

Una aplicación B2B "Offline-First" diseñada para el equipo de ventas de Comagro (Chacomer). Permite explorar el catálogo completo de productos, generar fichas técnicas corporativas en PDF, e interactuar con un Asistente de IA avanzado (Gemini) incluso en entornos de baja o nula conectividad.

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-1B1F23?style=for-the-badge&logo=expo&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=3ECF8E)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_AI-8E75B2?style=for-the-badge&logo=google&logoColor=white)

---

## 🌟 Características Principales

1. **Arquitectura Offline-First (SQLite):**
   - El catálogo entero (proveniente de Plytix) se sincroniza de manera silenciosa en segundo plano utilizando SQLite local.
   - Permite búsquedas instantáneas, navegación y cálculos sin depender de una conexión a internet.
   - El login se mantiene mediante un bypass seguro (`expo-secure-store`).

2. **Asistente de IA Integrado (Comagro AI Bot):**
   - Motor híbrido impulsado por **Google Gemini 2.5 Flash** y búsqueda matemática (Embeddings).
   - Extrae recomendaciones de productos basados en descripciones de ventas y responde consultas técnicas al instante.
   - *On-Demand Fetch:* Las recomendaciones sugeridas se descargan en tiempo real de la nube si aún no existen en la base local del usuario.

3. **Exportación y Generación de Fichas (PDF & Imágenes):**
   - Generación rápida de fichas técnicas en PDF con el branding y los colores corporativos.
   - Fallback de logos seguro y corrección de 404s mediante inyección dinámica de Base64.

4. **Comparador y Calculadoras:**
   - Comparador visual de especificaciones técnicas (hasta 4 productos).
   - Herramientas y calculadoras de capacidad integradas.

---

## 🏗️ Arquitectura del Sistema

El proyecto sigue una arquitectura fuertemente desacoplada:

- **Frontend:** React Native (Expo SDK).
- **Backend & Nube:** Supabase (Auth, PostgreSQL, Storage, Edge Functions).
- **Almacenamiento Local:** `expo-sqlite` para datos estructurados masivos y `expo-secure-store` para la bóveda de tokens JWT.
- **PIM:** Plytix (Origen de la verdad del catálogo), sincronizado mediante un Cronjob de Supabase Edge Functions.

### Estructura de Directorios Clave

```
app_comagro_2/
├── App.js                   # Entry point y lógica de Auth / Offline Bypass
├── src/
│   ├── components/          # Componentes reusables (Tarjetas, Modales, Cabeceras)
│   ├── contexts/            # Estados globales (Alertas, Sincronización)
│   ├── hooks/               # Custom hooks (Ej. useProducts para lógica de BD)
│   ├── screens/             # Vistas completas de navegación
│   ├── utils/               # Servicios auxiliares (PDF, Notificaciones, BD Local)
│   └── supabase.js          # Cliente de configuración Supabase
├── supabase/
│   └── functions/           # Supabase Edge Functions (Deno / TypeScript)
└── assets/                  # Iconos, Lottie animations, y tipografías
```

---

## 🛡️ Seguridad

- **Tokens Encriptados:** Los tokens de sesión nunca viven en memoria de texto plano, se inyectan en `SecureStore` (Keystore de Hardware).
- **Supabase RLS:** El acceso a la nube está protegido por Row Level Security (RLS) en las tablas de PostgreSQL.
- **Bypass Elegante:** El sistema puede iniciar la app y validar permisos sin depender de la latencia de la nube, sin crear huecos de acceso falso.

---

## 🛠️ Instalación y Desarrollo

Para ejecutar el proyecto localmente y realizar pruebas:

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
   Verificar que las claves de Supabase `SUPABASE_URL` y `SUPABASE_KEY` (Anon Key) estén correctas en `src/supabase.js`.

4. **Ejecutar en Entorno de Desarrollo (Expo Go / Emulador):**
   ```bash
   npx expo start
   ```

5. **Compilación (Cloud Build con EAS):**
   ```bash
   eas build --profile preview --platform android
   ```

---

## 📝 Changelog Reciente
- **v1.3.x:** Se integró "On-Demand Fetching" para Chat IA y Dashboard, mejorando radicalmente la UX sin conexión. Refactorización completa para asegurar un flujo offline ininterrumpido sin bloqueos de UI.
- **v1.2.x:** Soporte robusto para exportaciones offline, corrección de expresiones regulares para descargas de logos (eliminando el placeholder Magento) y perfiles de usuario obligatorios.

---

**© 2026 Chacomer SAE.** Todos los derechos reservados. Uso exclusivo interno corporativo.
