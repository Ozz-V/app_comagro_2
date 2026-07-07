import { create } from 'zustand';

interface AuthState {
  userId: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;
  setAuth: (userId: string | null, userEmail: string | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  userEmail: null,
  isAuthenticated: false,
  setAuth: (userId, userEmail) => set({ userId, userEmail, isAuthenticated: !!userId }),
  clearAuth: () => set({ userId: null, userEmail: null, isAuthenticated: false }),
}));
