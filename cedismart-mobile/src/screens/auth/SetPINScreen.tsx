import React, { useState } from 'react';
import { View, Text, Animated, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { Shield, Info, CheckCircle } from 'lucide-react-native';
import PINPad from '../../components/shared/PINPad';
import apiClient from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { CoinBackground } from '../../components/shared/CoinBackground';

const SetPINScreen = ({ route, navigation }: any) => {
  const { phone, otp, full_name } = route.params;
  const login = useAuthStore((state) => state.login);
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const shakeAnimation = useState(new Animated.Value(0))[0];

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = (digit: string) => {
    setError('');
    if (step === 'create') {
      if (pin.length < 6) {
        const newPin = pin + digit;
        setPin(newPin);
        if (newPin.length === 6) {
          if (/^(\d)\1+$/.test(newPin)) {
            setError('PIN is too simple. Try another.');
            setPin('');
            shake();
          } else {
            setTimeout(() => setStep('confirm'), 400);
          }
        }
      }
    } else {
      if (confirmPin.length < 6) {
        const newConfirmPin = confirmPin + digit;
        setConfirmPin(newConfirmPin);
        if (newConfirmPin.length === 6) {
          if (newConfirmPin === pin) {
            verifyMutation.mutate({ phone, otp, pin: newConfirmPin });
          } else {
            setError('PINs do not match. Start over.');
            setPin('');
            setConfirmPin('');
            setStep('create');
            shake();
          }
        }
      }
    }
  };

  const handleBackspace = () => {
    if (step === 'create') {
      setPin(pin.slice(0, -1));
    } else {
      setConfirmPin(confirmPin.slice(0, -1));
    }
  };

  const verifyMutation = useMutation({
    mutationFn: (data: { phone: string, otp: string, pin: string }) => {
      return apiClient.post('/auth/register/verify', {
        ...data,
        full_name: full_name,
      });
    },
    onSuccess: async (response) => {
      const { access_token, refresh_token, user } = response.data;
      await SecureStore.setItemAsync('access_token', access_token);
      await SecureStore.setItemAsync('refresh_token', refresh_token);
      login(user);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || 'Verification failed.');
      setPin('');
      setConfirmPin('');
      setStep('create');
      shake();
    }
  });

  const renderDots = () => {
    const currentPin = step === 'create' ? pin : confirmPin;
    return (
      <View className="flex-row justify-center space-x-6 mb-12">
        {[...Array(6)].map((_, i) => (
          <View
            key={i}
            className={`w-4 h-4 rounded-full shadow-sm transition-all duration-300 ${
              i < currentPin.length ? 'bg-primary scale-125' : isDark ? 'bg-dark-surface-container-low' : 'bg-gray-200'
            }`}
          />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
      <CoinBackground />
      <View className="flex-1 justify-between py-12 px-6">
        {/* Decoration Layer */}
        <View className="absolute inset-0 -z-10 opacity-[0.03] overflow-hidden">
          <View className="absolute top-10 right-10 w-64 h-64 border-8 border-primary rounded-full blur-3xl" />
          <View className="absolute bottom-20 left-10 w-96 h-96 border-8 border-tertiary rounded-full blur-3xl" />
        </View>

        {/* Header Section */}
        <View className="items-center mt-8">
          <View className={`w-16 h-16 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary-container'} items-center justify-center mb-6`}>
            <Shield size={32} color={isDark ? '#2e7d32' : '#ffffff'} fill={isDark ? '#2e7d32' : 'white'} />
          </View>
          <Text className={`font-headline font-extrabold text-3xl ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} mb-3 tracking-tight`}>Secure Your Account</Text>
          <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-medium text-sm text-center leading-relaxed px-4`}>
            Set up a 6-digit transaction PIN to protect your wealth and authorize transfers safely.
          </Text>
        </View>

        {/* PIN Status */}
        <Animated.View 
          style={{ transform: [{ translateX: shakeAnimation }] }}
          className="items-center"
        >
          <Text className="font-label text-xs uppercase tracking-widest text-primary font-bold mb-6">
            {step === 'create' ? 'Enter PIN' : 'Confirm PIN'}
          </Text>
          {renderDots()}
          
          <View className={`flex-row items-center space-x-2 transition-opacity ${error ? 'opacity-100' : 'opacity-0'}`}>
            <Info size={14} color="#ba1a1a" />
            <Text className="font-label text-xs font-semibold text-error">{error}</Text>
          </View>
        </Animated.View>

        {/* PINPad */}
        <View>
          <PINPad 
            onPress={handlePress} 
            onBackspace={handleBackspace} 
            disabled={verifyMutation.isPending}
          />
          <View className="mt-12 items-center opacity-30">
            <Text className={`font-headline font-black ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-widest text-[10px] uppercase`}>
              CediSmart Secure Layer
            </Text>
          </View>
        </View>
      </View>

      {/* Confirmation Overlay (Optional/Future V2) */}
      {verifyMutation.isPending && (
        <View className={`absolute top-0 left-0 right-0 bottom-0 w-full h-full ${isDark ? 'bg-dark-background/70' : 'bg-surface/50'} items-center justify-center z-50`}>
          <View className={`${isDark ? 'bg-dark-surface-container-lowest' : 'bg-white'} p-10 rounded-3xl shadow-2xl items-center border ${isDark ? 'border-dark-outline-variant/10' : 'border-transparent'}`}>
            <ActivityIndicator size="large" color={isDark ? '#2e7d32' : '#0d631b'} />
            <Text className={`mt-4 font-headline font-bold text-lg ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Verifying...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default SetPINScreen;
