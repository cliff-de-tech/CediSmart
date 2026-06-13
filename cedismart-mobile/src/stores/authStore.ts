import { create } from 'zustand';

/**
 * Auth state management for CediSmart.
 * 
 * IMPORTANT: This store only holds auth STATE (user profile, loading flags).
 * Sensitive tokens (access/refresh) are stored in SecureStore and managed
 * by the API adapter/session utility, NOT held in this global state.
 */

interface User {
  id: string;
  phone: string;
  full_name?: string;
  email?: string;
  currency: string;
  is_premium: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  login: (user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // App starts in loading state while hydrating session

  login: (user) => set({ user, isAuthenticated: true, isLoading: false }),
  
  logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),
  
  updateUser: (updatedFields) => 
    set((state) => ({
      user: state.user ? { ...state.user, ...updatedFields } : null
    })),
    
  setLoading: (isLoading) => set({ isLoading }),
}));
