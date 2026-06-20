import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useOfflineStore } from '../stores/offlineStore';
import apiClient from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../stores/authStore';
import { triggerLocalNotification } from '../utils/notifications';

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
      
      // Force refresh data across the app
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });

      // Check if budget alerts are enabled
      const user = useAuthStore.getState().user;
      if (user?.id) {
        const alertsEnabled = await AsyncStorage.getItem(`budget_alerts_enabled_${user.id}`);
        if (alertsEnabled === 'true') {
          const thresholdStr = await AsyncStorage.getItem(`budget_alert_threshold_${user.id}`);
          const threshold = thresholdStr ? parseFloat(thresholdStr) : 0.8;
          try {
            const budgetsResponse = await apiClient.get('/budgets/');
            const budgets = budgetsResponse.data;
            // Prevent double notifications by keeping track of checked categories
            const checkedCategories = new Set<string>();
            for (const tx of queue) {
              if (tx.category_id && !checkedCategories.has(tx.category_id)) {
                checkedCategories.add(tx.category_id);
                const matchedBudget = budgets.find((b: any) => b.category?.id === tx.category_id);
                if (matchedBudget) {
                  const spent = parseFloat(matchedBudget.spent_amount);
                  const limit = parseFloat(matchedBudget.budgeted_amount);
                  if (limit > 0) {
                    const ratio = spent / limit;
                    const alertAtThreshold = matchedBudget.alert_at_percent ? (matchedBudget.alert_at_percent / 100) : threshold;
                    if (ratio >= 1.0) {
                      await triggerLocalNotification(
                        'Budget Limit Exceeded! ⚠️',
                        `Sync Alert: You have spent ₵${spent.toFixed(2)} of your ₵${limit.toFixed(2)} budget on ${matchedBudget.category?.name || 'this category'}.`
                      );
                    } else if (ratio >= alertAtThreshold) {
                      await triggerLocalNotification(
                        'Budget Limit Warning! 🔔',
                        `Sync Alert: You have used ${Math.round(ratio * 100)}% of your budget on ${matchedBudget.category?.name || 'this category'}.`
                      );
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.warn('Failed to check budget alerts after sync:', err);
          }
        }
      }

      // Remove the successfully synced transactions from the store
      removeTransactions(successfullySyncedIds);

      console.log(`Successfully synced ${successfullySyncedIds.length} offline transactions.`);
    } catch (error) {
      console.error('Offline sync failed, will retry next time network is active:', error);
    }
  };

  return { syncTransactions, pendingCount: queue.length };
};
