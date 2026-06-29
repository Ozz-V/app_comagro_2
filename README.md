# Comagro App

Aplicación móvil corporativa para la gestión de catálogo de productos, herramientas de cálculo técnico, y asistencia inteligente con IA para la fuerza de ventas de **Comagro**.

## 🚀 Arquitectura y Tecnologías

El proyecto está construido bajo una arquitectura moderna orientada a la escalabilidad, el rendimiento en condiciones de baja conectividad, y la seguridad.

### Stack Tecnológico
*   **Frontend:** React Native (Framework) + Expo (Herramientas y Compilación).
*   **Backend & Base de Datos:** Supabase (PostgreSQL, Auth, Storage).
*   **Lógica Serverless:** Supabase Edge Functions (Deno / TypeScript).
*   **Inteligencia Artificial:** Google Gemini (Inferencia 2.5 Flash, Búsquedas Vectoriales con Embedding-2).
*   **CI/CD:** GitHub Actions + EAS (Expo Application Services).

---

## 🏗️ Estructura del Proyecto

```text
app_comagro_2/
├── .github/workflows/        # Pipelines de Integración Continua (CI/CD)
├── assets/                   # Íconos, splash screens y recursos estáticos
├── src/
│   ├── components/           # Componentes UI modulares y reutilizables
│   ├── contexts/             # Gestión de estado global (OfflineSync, CustomAlert)
│   ├── hooks/                # Custom hooks (Lógica de negocio, useProducts)
│   ├── screens/              # Vistas principales de navegación
│   ├── utils/                # Utilidades puras (Generación PDF, Notificaciones Push)
│   ├── supabase.js           # Cliente de inicialización de Supabase
│   └── theme.js              # Sistema de diseño (Colores, Tipografías)
├── supabase/functions/       # Código backend Edge Functions (Chat IA, sincronización)
├── App.js                    # Entry point, enrutador y gestor de actualizaciones OTA
├── app.json                  # Configuración principal de Expo
└── package.json              # Dependencias del ecosistema
```

---

## 🔒 Seguridad de Grado Corporativo

La aplicación implementa múltiples capas de seguridad para proteger la integridad de los datos y prevenir vulnerabilidades:

1.  **Protección Anti-Downgrade y MITM:** Las actualizaciones OTA (Over-The-Air) implementan validación estricta de hash criptográfico `SHA-256`. Si una actualización se corrompe o es interceptada, la instalación se aborta automáticamente.
2.  **Anti-Debugging:** Se ha inyectado `android:allowBackup="false"` en el manifiesto para prevenir la extracción de bases de datos locales mediante herramientas de desarrollo (ADB).
3.  **Seguridad de Identidad:** Integración directa con `Supabase Auth` gestionando tokens JWT con auto-refresco. Los servicios de Edge Functions validan el JWT de forma estricta antes de procesar operaciones.
4.  **Control de IA:** El Asistente IA (Chat) incluye control de cuotas y un sistema de "Strikes" que suspende a los usuarios que abusen de consultas no relacionadas al negocio.

---

## 🔄 Flujo de Integración Continua (CI/CD)

El desarrollo se integra directamente con **GitHub Actions** para garantizar un despliegue seguro y trazable:

1.  **Auto-Versionamiento:** Un script automatizado incrementa el `versionCode` internamente.
2.  **Firma Criptográfica Segura:** Las llaves de producción (`keystore`) están inyectadas dinámicamente durante el build desde secretos de GitHub (no residen en el repositorio).
3.  **Compilación en la Nube:** Construcción nativa en entornos aislados de Ubuntu.
4.  **Distribución Release Candidate:** Generación automática de versiones `rc-X` en el repositorio público de descargas al finalizar exitosamente la compilación.

---

## 🛠️ Entorno de Desarrollo (Local)

Para levantar el entorno local:

1.  Clonar el repositorio.
2.  Instalar dependencias:
    ```bash
    npm install
    ```
3.  Iniciar el servidor de desarrollo de Expo:
    ```bash
    npx expo start
    ```
4.  Para probar las funciones Edge localmente usando Supabase CLI:
    ```bash
    npx supabase functions serve chat --no-verify-jwt
    ```

---
*Mantenido por el equipo de tecnología de Comagro.*
