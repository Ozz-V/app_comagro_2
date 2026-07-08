import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';

interface AuthState {
  userId: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  session: Session | null;
  setAuth: (session: Session | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  userEmail: null,
  isAuthenticated: false,
  isInitialized: false,
  session: null,
  setAuth: (session) => set({
    session,
    userId: session?.user?.id || null,
    userEmail: session?.user?.email || null,
    isAuthenticated: !!session,
    isInitialized: true,
  }),
  clearAuth: () => set({
    userId: null,
    userEmail: null,
    isAuthenticated: false,
    session: null,
    isInitialized: true,
  }),
}));
