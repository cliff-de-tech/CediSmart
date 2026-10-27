import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { View, ActivityIndicator, AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import { useAuthStore, User, SavedAccount } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import apiClient from '../api/client';
import { AppLockOverlay } from '../components/shared/AppLockOverlay';
import { registerForPushNotificationsAsync } from '../utils/notifications';

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    if (typeof globalThis.atob === 'function') {
      const payload = JSON.parse(globalThis.atob(padded));
      return typeof payload?.sub === 'string' ? payload.sub : null;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveInstantUser(
  accessToken: string,
  cachedUserStr: string | null,
  savedAccountsStr: string | null
): User | null {
  if (cachedUserStr) {
    try {
      const parsed = JSON.parse(cachedUserStr);
      if (parsed && parsed.id) {
        return parsed as User;
      }
    } catch {}
  }

  const jwtUserId = decodeJwtSub(accessToken);

  if (savedAccountsStr) {
    try {
      const list: SavedAccount[] = JSON.parse(savedAccountsStr);
      if (Array.isArray(list) && list.length > 0) {
        const matched =
          (jwtUserId ? list.find((a) => a.id === jwtUserId) : null) ||
          list[list.length - 1];
        if (matched && matched.id) {
          return {
            id: matched.id,
            phone: matched.phone || '',
            full_name: matched.full_name,
            currency: 'GHS',
            is_premium: true,
            has_premium_access: true,
          };
        }
      }
    } catch {}
  }

  if (jwtUserId) {
    return {
      id: jwtUserId,
      phone: '',
      currency: 'GHS',
      is_premium: true,
      has_premium_access: true,
    };
  }

  return null;
}

const RootNavigator = () => {
  const { isAuthenticated, isLoading, login, setLoading, logout, user } = useAuthStore();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const [isLocked, setIsLocked] = useState(false);
  const backgroundTimeRef = useRef<number | null>(null);
  const isInitialSessionHydrationRef = useRef(true);
  const wentToBackgroundRef = useRef(false);

  // True while a system biometric/passcode dialog is on-screen.
  // All AppState transitions are suppressed while this flag is set,
  // because the OS dialog itself causes spurious background↔active cycles.
  const biometricInProgressRef = useRef(false);

  // Synchronous cooldown: ignore background transitions for 2s after unlock
  // to cover any delayed OS dialog-dismissal transitions that arrive after
  // the biometricInProgress flag has already been cleared.
  const justUnlockedAtRef = useRef<number>(0);

  const handleUnlock = useCallback(() => {
    justUnlockedAtRef.current = Date.now();
    wentToBackgroundRef.current = false;
    backgroundTimeRef.current = null;
    setIsLocked(false);
  }, []);

  const handleBiometricStateChange = useCallback((inProgress: boolean) => {
    biometricInProgressRef.current = inProgress;
    if (inProgress) {
      // Also preemptively reset background tracking so any transitions
      // that sneak in during the dialog can't trigger a re-lock.
      wentToBackgroundRef.current = false;
      backgroundTimeRef.current = null;
    }
  }, []);

  // Register for push notifications on login/authentication
  useEffect(() => {
    const registerToken = async () => {
      if (isAuthenticated) {
        try {
          const token = await registerForPushNotificationsAsync();
          if (token && token !== 'expo-go-dummy-token') {
            await apiClient.post('/users/me/device-tokens', {
              token: token,
              device_name: Platform.OS === 'ios' ? 'iPhone' : 'Android Device',
              platform: Platform.OS,
            });
            console.log('[Notifications] Token registered with server successfully.');
          }
        } catch (err: any) {
          console.warn('[Notifications] Failed to send push token to server:', err?.message || err);
        }
      }
    };
    registerToken();
  }, [isAuthenticated]);

  // App lock listener
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setIsLocked(false);
      return;
    }

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (biometricInProgressRef.current) {
        return;
      }

      if (nextAppState === 'active') {
        if (wentToBackgroundRef.current) {
          const lockSetting = await AsyncStorage.getItem(`app_lock_setting_${user.id}`);
          if (lockSetting && lockSetting !== 'never') {
            if (lockSetting === 'immediate') {
              setIsLocked(true);
            } else if (backgroundTimeRef.current) {
              const elapsed = Date.now() - backgroundTimeRef.current;
              const threshold = lockSetting === '2mins' ? 120000 : 300000;
              if (elapsed >= threshold) {
                setIsLocked(true);
              }
            }
          }
        }
        wentToBackgroundRef.current = false;
        backgroundTimeRef.current = null;
      } else if (nextAppState === 'background') {
        const msSinceUnlock = Date.now() - justUnlockedAtRef.current;
        if (msSinceUnlock > 2000) {
          wentToBackgroundRef.current = true;
          backgroundTimeRef.current = Date.now();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    if (isInitialSessionHydrationRef.current) {
      AsyncStorage.getItem(`app_lock_setting_${user.id}`).then((lockSetting) => {
        if (lockSetting && lockSetting !== 'never') {
          setIsLocked(true);
        }
      });
    }

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    const revalidateInBackground = async () => {
      const attempts = [10000, 25000];
      for (let i = 0; i < attempts.length; i++) {
        try {
          const response = await apiClient.get('/users/me', {
            timeout: attempts[i],
          });
          await AsyncStorage.setItem('cached_user_profile', JSON.stringify(response.data)).catch(() => {});
          login(response.data);
          return;
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            await SecureStore.deleteItemAsync('access_token').catch(() => {});
            await SecureStore.deleteItemAsync('refresh_token').catch(() => {});
            await AsyncStorage.removeItem('cached_user_profile').catch(() => {});
            logout();
            return;
          }
          // Network or cold-start timeout — continue silently in background
        }
      }
    };

    const hydrateSession = async () => {
      try {
        const [accessToken, cachedUserStr, savedAccountsStr] = await Promise.all([
          SecureStore.getItemAsync('access_token'),
          AsyncStorage.getItem('cached_user_profile').catch(() => null),
          AsyncStorage.getItem('saved_accounts_list').catch(() => null),
        ]);

        if (!accessToken) {
          logout();
          return;
        }

        // Instant Local-First Hydration (<20ms): Enter the app interface immediately
        // without blocking on server cold starts.
        const instantUser = resolveInstantUser(accessToken, cachedUserStr, savedAccountsStr);
        if (instantUser) {
          login(instantUser);
          setLoading(false);
          setTimeout(() => {
            isInitialSessionHydrationRef.current = false;
          }, 1000);
          // Silently sync latest profile in the background
          void revalidateInBackground();
          return;
        }

        // Fallback only if no local user identity could be resolved at all
        await revalidateInBackground();
      } catch (error: any) {
        console.error('Session hydration failed:', error?.message || error);
        logout();
      } finally {
        setLoading(false);
        setTimeout(() => {
          isInitialSessionHydrationRef.current = false;
        }, 1000);
      }
    };

    hydrateSession();
  }, []);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#0b120e' : '#f8faf8',
        }}
      >
        <ActivityIndicator size="large" color={isDark ? '#4ade80' : '#0A6E4A'} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppNavigator /> : <AuthNavigator />}
      <AppLockOverlay
        visible={isLocked}
        onUnlock={handleUnlock}
        onBiometricStateChange={handleBiometricStateChange}
      />
    </NavigationContainer>
  );
};

export default RootNavigator;
