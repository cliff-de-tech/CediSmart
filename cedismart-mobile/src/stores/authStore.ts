import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Auth state management for CediSmart with Multi-Account Switcher support.
 * 
 * IMPORTANT: This store holds the currently active user profile state
 * and a list of saved profile accounts registered on the device.
 * Sensitive tokens are securely stored in SecureStore.
 */

export interface User {
  id: string;
  phone: string;
  full_name?: string;
  email?: string;
  currency: string;
  is_premium: boolean;
  trial_started_at?: string;
  is_trial_active?: boolean;
  trial_days_remaining?: number;
  has_premium_access?: boolean;
}

export interface SavedAccount {
  id: string;
  phone: string;
  full_name?: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  savedAccounts: SavedAccount[];
  
  // Actions
  login: (user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setLoading: (isLoading: boolean) => void;
  loadSavedAccounts: () => Promise<void>;
  addSavedAccount: (account: SavedAccount) => Promise<void>;
  removeSavedAccount: (phone: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  savedAccounts: [],

  login: (user) => {
    set({ user, isAuthenticated: true, isLoading: false });
    
    // Auto-save the account to the device list (and update existing entries)
    const saveAcc = async () => {
      try {
        const listStr = await AsyncStorage.getItem('saved_accounts_list');
        let list: SavedAccount[] = listStr ? JSON.parse(listStr) : [];
        const existingIdx = list.findIndex((acc) => acc.phone === user.phone);
        if (existingIdx >= 0) {
          // Update existing entry with latest data
          list[existingIdx] = { ...list[existingIdx], id: user.id, full_name: user.full_name };
        } else {
          list.push({ id: user.id, phone: user.phone, full_name: user.full_name });
        }
        await AsyncStorage.setItem('saved_accounts_list', JSON.stringify(list));
        set({ savedAccounts: list });
      } catch (e) {
        console.warn('Failed to auto-save account:', e);
      }
    };
    saveAcc();
  },
  
  logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),
  
  updateUser: (updatedFields) => 
    set((state) => ({
      user: state.user ? { ...state.user, ...updatedFields } : null
    })),
    
  setLoading: (isLoading) => set({ isLoading }),

  loadSavedAccounts: async () => {
    try {
      const listStr = await AsyncStorage.getItem('saved_accounts_list');
      const list: SavedAccount[] = listStr ? JSON.parse(listStr) : [];
      set({ savedAccounts: list });
    } catch (e) {
      console.warn('Failed to load saved accounts:', e);
    }
  },

  addSavedAccount: async (account) => {
    try {
      const listStr = await AsyncStorage.getItem('saved_accounts_list');
      const list: SavedAccount[] = listStr ? JSON.parse(listStr) : [];
      if (!list.some((acc) => acc.phone === account.phone)) {
        list.push(account);
        await AsyncStorage.setItem('saved_accounts_list', JSON.stringify(list));
      }
      set({ savedAccounts: list });
    } catch (e) {
      console.warn('Failed to add saved account:', e);
    }
  },

  removeSavedAccount: async (phone) => {
    try {
      const listStr = await AsyncStorage.getItem('saved_accounts_list');
      const list: SavedAccount[] = listStr ? JSON.parse(listStr) : [];
      const updated = list.filter((acc) => acc.phone !== phone);
      await AsyncStorage.setItem('saved_accounts_list', JSON.stringify(updated));
      set({ savedAccounts: updated });

      // Clean up secure credentials
      const sanitized = phone.replace(/[^\w.-]/g, '');
      await SecureStore.deleteItemAsync(`session_access_token_${sanitized}`).catch(() => {});
      await SecureStore.deleteItemAsync(`session_refresh_token_${sanitized}`).catch(() => {});
      await SecureStore.deleteItemAsync(`user_pin_${sanitized}`).catch(() => {});

      // If removed account was the currently active user, log out
      const currentUser = get().user;
      if (currentUser && currentUser.phone === phone) {
        await SecureStore.deleteItemAsync('active_session_phone').catch(() => {});
        await SecureStore.deleteItemAsync('access_token').catch(() => {});
        await SecureStore.deleteItemAsync('refresh_token').catch(() => {});
        get().logout();
      }
    } catch (e) {
      console.warn('Failed to remove saved account:', e);
    }
  },
}));
