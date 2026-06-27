import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from 'nativewind';
import { useThemeStore } from './src/stores/themeStore';
import RootNavigator from './src/navigation/RootNavigator';

// Create a query client with optimized default settings for mobile
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Keep data fresh for 5 minutes (avoids spinner loops on tab change)
      gcTime: 1000 * 60 * 30,    // Cache inactive queries for 30 minutes
      refetchOnWindowFocus: false, // Not needed on mobile apps
      retry: 1,
    },
  },
});

export default function App() {
  const { setColorScheme } = useColorScheme();
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    setColorScheme(theme);
  }, [theme, setColorScheme]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
          <RootNavigator />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

