import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encryptData, decryptData } from '../utils/secureStorage';

export interface OfflineTransaction {
  client_id: string;
  account_id: string;
  category_id: string;
  amount: number;
  transaction_type: 'income' | 'expense';
  description?: string;
  transaction_date: string; // ISO format (YYYY-MM-DD)
  notes?: string;
  queued_at: string; // ISO datetime
}

interface OfflineStoreState {
  queue: OfflineTransaction[];
  addTransaction: (tx: OfflineTransaction) => void;
  removeTransactions: (clientIds: string[]) => void;
  clearQueue: () => void;
}

const encryptedStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await AsyncStorage.getItem(name);
    if (!value) return null;
    try {
      return await decryptData(value);
    } catch (e) {
      console.error('[EncryptedStorage] Decryption failed, returning null', e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const encryptedValue = await encryptData(value);
      await AsyncStorage.setItem(name, encryptedValue);
    } catch (e) {
      console.error('[EncryptedStorage] Encryption failed', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    await AsyncStorage.removeItem(name);
  },
};

export const useOfflineStore = create<OfflineStoreState>()(
  persist(
    (set) => ({
      queue: [],
      
      addTransaction: (tx) => set((state) => ({ 
        queue: [...state.queue, tx] 
      })),
      
      removeTransactions: (clientIds) => set((state) => ({ 
        queue: state.queue.filter(tx => !clientIds.includes(tx.client_id)) 
      })),
      
      clearQueue: () => set({ queue: [] }),
    }),
    {
      name: 'offline-transactions-storage',
      storage: createJSONStorage(() => encryptedStorage),
    }
  )
);
