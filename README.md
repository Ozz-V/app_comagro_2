# Comagro Catalog App

Mobile application for the Comagro B2B sales team. Provides an interactive catalog interface with offline support, AI-assisted search, and PDF technical sheet generation.

## Features
- **Offline-First Architecture:** Local SQLite caching for seamless operation without internet connectivity.
- **AI Search Assistant:** Integrated LLM search for complex product queries.
- **PDF Generation:** On-the-fly technical sheet creation for client sharing.
- **PIM Integration:** Automated catalog syncing with Plytix via Supabase Edge Functions.

## Tech Stack
- **Framework:** React Native (Expo)
- **Language:** TypeScript
- **State Management:** Zustand, React Query
- **Backend/Database:** Supabase (PostgreSQL)
- **Local Storage:** expo-sqlite

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Expo CLI
- iOS Simulator or Android Emulator

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Ozz-V/app_comagro_2.git
   cd app_comagro_2
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Environment Variables:
   Create a `.env` file in the root directory and configure your keys:
   ```
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   EXPO_PUBLIC_EDGE_URL=your_edge_function_url
   ```

4. Start the development server:
   ```bash
   npx expo start
   ```

## Build & Deployment
Production APKs are generated automatically via GitHub Actions upon pushes to the `main` branch. 
For local builds, you can use Expo Application Services (EAS):
```bash
eas build --platform android --profile production
```

## License
Proprietary software. © Chacomer SAE. All rights reserved.
