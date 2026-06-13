import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
