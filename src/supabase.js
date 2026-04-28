import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = 'https://itylpvuzflqlmmqvdhbz.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0eWxwdnV6ZmxxbG1tcXZkaGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjYzMTgsImV4cCI6MjA5MTg0MjMxOH0.yuZ5sWX-Isxd04ySP_ZgDLit1fQDsxoeb25GmU_C_5I';
export const EDGE_URL    = 'https://itylpvuzflqlmmqvdhbz.supabase.co/functions/v1/swift-task';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Importante para React Native: manejar el estado de la app para refrescar el token
import { AppState } from 'react-native';

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
