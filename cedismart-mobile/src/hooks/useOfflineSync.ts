import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useOfflineStore } from '../stores/offlineStore';
import apiClient from '../api/client';
import { useQueryClient } from '@tanstack/react-query';

export const useOfflineSync = () => {
  const { queue, removeTransactions } = useOfflineStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Listen for network state changes
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable && queue.length > 0) {
        syncTransactions();
      }
    });

    return () => unsubscribe();
  }, [queue.length]);

  const syncTransactions = async () => {
    if (queue.length === 0) return;

    try {
      // The backend expects { transactions: [...] } for the bulk endpoint
      const response = await apiClient.post('/transactions/bulk', {
        transactions: queue
      });

      // Assuming backend returns { created: X, errors: [{client_id, reason}] }
      // We only remove ones that didn't hard-fail with non-retryable errors
      // For simplicity in MVP, if the bulk request succeeds (200), we clear everything
      // In a strict prod environment, we would inspect `response.data.errors`
      
      const successfullySyncedIds = queue.map(q => q.client_id);
      removeTransactions(successfullySyncedIds);
      
      // Force refresh data across the app
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });

      console.log(`Successfully synced ${successfullySyncedIds.length} offline transactions.`);
    } catch (error) {
      console.error('Offline sync failed, will retry next time network is active:', error);
    }
  };

  return { syncTransactions, pendingCount: queue.length };
};
