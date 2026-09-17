import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';

interface AuthState {
  userId: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  session: Session | null;
  isAdmin: boolean;
  setAuth: (session: Session | null) => void;
  clearAuth: () => void;
  setIsAdmin: (isAdmin: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  userEmail: null,
  isAuthenticated: false,
  isInitialized: false,
  session: null,
  isAdmin: false,
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
    isAdmin: false,
  }),
  setIsAdmin: (isAdmin) => set({ isAdmin }),
}));
