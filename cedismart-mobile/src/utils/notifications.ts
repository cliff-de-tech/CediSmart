import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure how notifications should behave when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Registers for push notifications, requests permission, and returns the Expo Push Token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    // Remote push notifications are removed from Expo Go starting SDK 53.
    // Skip remote token retrieval in Expo Go to avoid warnings/crashes.
    if (Constants.appOwnership === 'expo') {
      console.log('[Notifications] Running in Expo Go. Remote push registration skipped.');
      return 'expo-go-dummy-token';
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    })).data;

    if (token) {
      await AsyncStorage.setItem('expo_push_token', token);
    }
    return token;
  } catch (error) {
    console.warn('Failed to get Expo push token:', error);
    return null;
  }
}

/**
 * Requests notification permissions from the user.
 * On Android, also configures a default notification channel.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0d631b',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Notification permissions not granted!');
    return false;
  }

  return true;
}

/**
 * Triggers a local push notification immediately.
 */
export async function triggerLocalNotification(title: string, body: string, data: Record<string, any> = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: null, // null means trigger immediately
    });
  } catch (error) {
    console.error('Failed to trigger local notification:', error);
  }
}
