import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Modal, SafeAreaView, ActivityIndicator } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Shield } from 'lucide-react-native';
import PINPad from './PINPad';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import { CoinBackground } from './CoinBackground';

interface AppLockOverlayProps {
  visible: boolean;
  onUnlock: () => void;
  /** Called with true when a system biometric/passcode dialog is about to show,
   *  and false when it finishes. The parent should suppress AppState re-locks
   *  while this is true. */
  onBiometricStateChange?: (inProgress: boolean) => void;
}

export const AppLockOverlay: React.FC<AppLockOverlayProps> = ({ visible, onUnlock, onBiometricStateChange }) => {
  const isDark = useThemeStore((state) => state.theme) === 'dark';
  const user = useAuthStore((state) => state.user);
  
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | null>(null);

  // Prevent auto-triggering biometrics more than once per lock session
  const hasAutoTriggeredRef = useRef(false);
  // Prevent concurrent authenticateAsync calls
  const biometricInProgressRef = useRef(false);

  useEffect(() => {
    let timerId: NodeJS.Timeout;

    if (!visible) {
      setPin('');
      setError('');
      // Reset for the next time the overlay appears
      hasAutoTriggeredRef.current = false;
      biometricInProgressRef.current = false;
      return;
    }

    // Check biometric compatibility
    const checkBiometrics = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        
        if (hasHardware && isEnrolled && user?.id) {
          const biometricEnabled = await AsyncStorage.getItem(`biometric_enabled_${user.id}`);
          if (biometricEnabled === 'true') {
            setBiometricAvailable(true);
            const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
            if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
              setBiometricType('face');
            } else {
              setBiometricType('fingerprint');
            }
            // Auto-trigger only once per lock session
            if (!hasAutoTriggeredRef.current) {
              hasAutoTriggeredRef.current = true;
              timerId = setTimeout(() => {
                triggerBiometrics();
              }, 400);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to check biometrics:', err);
      }
    };

    checkBiometrics();

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [visible, user?.id]);

  const triggerBiometrics = async () => {
    // Guard: don't launch a second dialog while one is already active
    if (biometricInProgressRef.current) return;
    biometricInProgressRef.current = true;

    // Tell parent to suppress AppState re-locks while the OS dialog is up
    onBiometricStateChange?.(true);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock CediSmart',
        fallbackLabel: 'Enter PIN',
      });

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onUnlock();
      }
    } catch (err) {
      console.warn('Biometric auth failed:', err);
    } finally {
      biometricInProgressRef.current = false;
      onBiometricStateChange?.(false);
    }
  };

  const handleDigitPress = async (digit: string) => {
    if (pin.length >= 6 || isVerifying) return;
    setError('');
    const newPin = pin + digit;
    setPin(newPin);

    if (newPin.length === 6) {
      setIsVerifying(true);
      try {
        if (!user?.phone) {
          setError('Verification error: user not logged in.');
          setPin('');
          setIsVerifying(false);
          return;
        }
        const normalizePhoneNumber = (p: string): string => {
          if (!p) return '';
          const clean = p.replace(/[^\d+]/g, '');
          if (clean.startsWith('+233')) return clean;
          if (clean.startsWith('233')) return `+${clean}`;
          if (clean.startsWith('0')) return `+233${clean.substring(1)}`;
          return `+233${clean}`;
        };
        const normalizedPhone = normalizePhoneNumber(user.phone);
        const phoneKey = normalizedPhone.replace(/[^\w.-]/g, '');
        const storedPin = await SecureStore.getItemAsync(`user_pin_${phoneKey}`);

        if (storedPin === newPin) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onUnlock();
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          setError('Incorrect security PIN. Please try again.');
          setPin('');
        }
      } catch (err) {
        setError('Error reading credentials.');
        setPin('');
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleBackspace = () => {
    if (pin.length === 0 || isVerifying) return;
    setError('');
    setPin(pin.slice(0, -1));
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
    >
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-background'} justify-between px-6 py-10`}>
        <CoinBackground />
        
        {/* Header Icon & Title */}
        <View className="items-center mt-12">
          <View className={`w-16 h-16 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center mb-4`}>
            <Shield size={32} color={isDark ? '#4ade80' : '#16a34a'} />
          </View>
          <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
            App Locked
          </Text>
          <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} font-body mt-1 text-center px-8`}>
            Enter your 6-digit security PIN or use biometrics to continue
          </Text>
        </View>

        {/* PIN Indicators & Errors */}
        <View className="items-center my-6">
          <View className="flex-row justify-center space-x-4 mb-4">
            {[...Array(6)].map((_, i) => (
              <View
                key={i}
                className={`w-4 h-4 rounded-full border-2 border-primary ${
                  i < pin.length ? 'bg-primary' : 'bg-transparent'
                }`}
              />
            ))}
          </View>
          
          <View className="h-6">
            {error ? (
              <Text className="text-error text-sm font-semibold">{error}</Text>
            ) : isVerifying ? (
              <ActivityIndicator size="small" color="#0d631b" />
            ) : null}
          </View>
        </View>

        {/* PINPad */}
        <View className="mb-10 w-full">
          <PINPad
            onPress={handleDigitPress}
            onBackspace={handleBackspace}
            onBiometricPress={biometricAvailable ? triggerBiometrics : undefined}
            biometricType={biometricType}
            disabled={isVerifying}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};
