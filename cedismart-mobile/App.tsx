import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityPreferencesProvider } from './src/providers/AccessibilityPreferences';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from 'nativewind';
import { useThemeStore } from './src/stores/themeStore';
import RootNavigator from './src/navigation/RootNavigator';
import { ClerkProviderWrapper } from './src/providers/ClerkProvider';
import apiClient from './src/api/client';

const QUERY_CACHE_STORAGE_KEY = 'cedismart_query_cache_v1';
const PERSISTED_QUERY_PREFIXES = new Set([
  'accounts',
  'transactions',
  'budgets',
  'categories',
  'reports',
  'goals',
]);

// Create a query client with optimized default settings for mobile
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Keep data fresh for 5 minutes (avoids spinner loops on tab change)
      gcTime: 1000 * 60 * 60 * 24, // Keep cached data for 24 hours for instant cold-start display
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Hydrate cached queries immediately on module load so Dashboard renders populated at 0ms
void AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const entries: Array<{ queryKey: unknown[]; data: unknown }> = JSON.parse(raw);
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (Array.isArray(entry.queryKey) && entry.data !== undefined) {
        // Only seed if live network data hasn't arrived yet
        if (queryClient.getQueryData(entry.queryKey) === undefined) {
          queryClient.setQueryData(entry.queryKey, entry.data);
        }
      }
    }
  })
  .catch(() => {});

// Debounced persistence of successful core queries to AsyncStorage
let persistTimeout: ReturnType<typeof setTimeout> | null = null;
queryClient.getQueryCache().subscribe((event) => {
  if (event?.type === 'updated' && event.action?.type === 'success') {
    const firstKey = event.query?.queryKey?.[0];
    if (typeof firstKey === 'string' && PERSISTED_QUERY_PREFIXES.has(firstKey)) {
      if (persistTimeout) clearTimeout(persistTimeout);
      persistTimeout = setTimeout(() => {
        try {
          const allQueries = queryClient.getQueryCache().getAll();
          const snapshot = allQueries
            .filter((q) => {
              const prefix = q.queryKey?.[0];
              return (
                typeof prefix === 'string' &&
                PERSISTED_QUERY_PREFIXES.has(prefix) &&
                q.state.data !== undefined
              );
            })
            .slice(0, 30)
            .map((q) => ({
              queryKey: q.queryKey,
              data: q.state.data,
            }));
          void AsyncStorage.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {});
        } catch {}
      }, 600);
    }
  }
});

export default function App() {
  const { setColorScheme } = useColorScheme();
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    setColorScheme(theme);
  }, [theme, setColorScheme]);

  // Silent non-blocking server warm-up pulse on launch & foreground resume
  useEffect(() => {
    void apiClient.get('/health', { timeout: 15000 }).catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void apiClient.get('/health', { timeout: 15000 }).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <ClerkProviderWrapper>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <AccessibilityPreferencesProvider>
              <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
              <RootNavigator />
            </AccessibilityPreferencesProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ClerkProviderWrapper>
  );
}
