import React from 'react';
import { ClerkProvider } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const timeoutPromise = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

// Token cache using expo-secure-store for React Native session persistence
const createTokenCache = () => ({
  async getToken(key: string) {
    try {
      // Race SecureStore against a 2-second timeout to prevent emulator startup hangs
      const item = await Promise.race([
        SecureStore.getItemAsync(key),
        timeoutPromise(2000)
      ]);
      if (item) {
        console.log(`Clerk token retrieved from SecureStore key: ${key}`);
      } else {
        console.log(`No values stored under key (or SecureStore timed out): ${key}`);
      }
      return item;
    } catch (error) {
      console.error('SecureStore get item error: ', error);
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {}
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      console.error('SecureStore save item error: ', err);
      return;
    }
  },
});

export const tokenCache = Platform.OS !== 'web' ? createTokenCache() : undefined;


const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

if (!clerkPublishableKey) {
  console.warn(
    'Warning: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not defined in your environment variables. ' +
    'Authentication flows will not work properly.'
  );
}

interface ClerkProviderWrapperProps {
  children: React.ReactNode;
}

export const ClerkProviderWrapper = ({ children }: ClerkProviderWrapperProps) => {
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      tokenCache={tokenCache}
    >
      {children}
    </ClerkProvider>
  );
};
