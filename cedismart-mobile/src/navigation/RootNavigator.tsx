import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { View, ActivityIndicator } from 'react-native';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import { useAuthStore } from '../stores/authStore';
import apiClient from '../api/client';

const RootNavigator = () => {
  const { isAuthenticated, isLoading, login, setLoading, logout } = useAuthStore();

  useEffect(() => {
    const hydrateSession = async () => {
      try {
        const accessToken = await SecureStore.getItemAsync('access_token');
        if (accessToken) {
          // Attempt to get user profile to verify token and hydrate state
          const response = await apiClient.get('/users/me');
          login(response.data);
        } else {
          logout();
        }
      } catch (error: any) {
        console.error('Session hydration failed:', error?.message || error);
        // Clear potentially stale/invalid tokens so the user
        // isn't stuck in a broken state on next launch
        await SecureStore.deleteItemAsync('access_token').catch(() => {});
        await SecureStore.deleteItemAsync('refresh_token').catch(() => {});
        logout();
      } finally {
        setLoading(false);
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
    </NavigationContainer>
  );
};

export default RootNavigator;
