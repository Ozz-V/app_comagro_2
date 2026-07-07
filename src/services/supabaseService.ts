import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Database } from '../models/database.types';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://itylpvuzflqlmmqvdhbz.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0eWxwdnV6ZmxxbG1tcXZkaGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjYzMTgsImV4cCI6MjA5MTg0MjMxOH0.yuZ5sWX-Isxd04ySP_ZgDLit1fQDsxoeb25GmU_C_5I';
export const EDGE_URL = process.env.EXPO_PUBLIC_EDGE_URL || `${SUPABASE_URL}/functions/v1/swift-task`;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
