import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://itylpvuzflqlmmqvdhbz.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0eWxwdnV6ZmxxbG1tcXZkaGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjYzMTgsImV4cCI6MjA5MTg0MjMxOH0.yuZ5sWX-Isxd04ySP_ZgDLit1fQDsxoeb25GmU_C_5I';
export const EDGE_URL     = process.env.EXPO_PUBLIC_EDGE_URL || 'https://itylpvuzflqlmmqvdhbz.supabase.co/functions/v1/swift-task';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // CRITICO: en React Native debe ser false
  },
});

AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
