import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { View, ActivityIndicator, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import { useAuthStore } from '../stores/authStore';
import apiClient from '../api/client';
import { AppLockOverlay } from '../components/shared/AppLockOverlay';
import { registerForPushNotificationsAsync } from '../utils/notifications';

const RootNavigator = () => {
  const { isAuthenticated, isLoading, login, setLoading, logout, user } = useAuthStore();
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
    if (isAuthenticated) {
      registerForPushNotificationsAsync().catch(err => {
        console.warn('Failed to register push notifications:', err);
      });
    }
  }, [isAuthenticated]);

  // App lock listener
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setIsLocked(false);
      return;
    }

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      // Completely ignore ALL state transitions while a biometric/passcode
      // system dialog is on screen — the OS fires spurious background↔active
      // cycles that don't represent actual user navigation.
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
        // Also honour the post-unlock cooldown to catch any delayed
        // OS dialog-dismissal transitions that arrive after the
        // biometricInProgress flag has already been cleared.
        const msSinceUnlock = Date.now() - justUnlockedAtRef.current;
        if (msSinceUnlock > 2000) {
          wentToBackgroundRef.current = true;
          backgroundTimeRef.current = Date.now();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Also check on mount if we need to lock on initial load (only for cold start session hydration)
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
    const hydrateSession = async () => {
      try {
        const accessToken = await SecureStore.getItemAsync('access_token');
        if (accessToken) {
          const response = await apiClient.get('/users/me');
          login(response.data);
        } else {
          logout();
        }
      } catch (error: any) {
        console.error('Session hydration failed:', error?.message || error);
        await SecureStore.deleteItemAsync('access_token').catch(() => {});
        await SecureStore.deleteItemAsync('refresh_token').catch(() => {});
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
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#0A6E4A" />
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
