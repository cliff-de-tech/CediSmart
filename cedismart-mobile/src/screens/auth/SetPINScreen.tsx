import React, { useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import PINPad from '../../components/shared/PINPad';
import apiClient from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

const SetPINScreen = ({ route, navigation }: any) => {
  const { phone, otp } = route.params;
  const login = useAuthStore((state) => state.login);
  
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
          // Validate: not all same digit
          if (/^(\d)\1+$/.test(newPin)) {
            setError('PIN is too simple. Try another.');
            setPin('');
            shake();
          } else {
            setTimeout(() => setStep('confirm'), 300);
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
        full_name: 'New User', // Placeholder
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
      <View className="flex-row justify-center space-x-4 mb-12">
        {[...Array(6)].map((_, i) => (
          <View
            key={i}
            className={`w-4 h-4 rounded-full border-2 border-primary ${i < currentPin.length ? 'bg-primary' : 'bg-transparent'}`}
          />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center px-6">
        <Animated.View 
          style={{ transform: [{ translateX: shakeAnimation }] }}
          className="items-center"
        >
          <Text className="text-3xl font-bold text-charcoal mb-2">
            {step === 'create' ? 'Create PIN' : 'Confirm PIN'}
          </Text>
          <Text className="text-gray-500 mb-12 text-center text-lg">
            {step === 'create' 
              ? 'Set a 6-digit PIN to secure your account.' 
              : 'Re-enter your PIN to confirm.'}
          </Text>

          {renderDots()}

          {error ? (
            <Text className="text-error text-sm mb-4 text-center">{error}</Text>
          ) : null}
        </Animated.View>

        <PINPad 
          onPress={handlePress} 
          onBackspace={handleBackspace} 
          disabled={verifyMutation.isPending}
        />
      </View>
    </SafeAreaView>
  );
};

export default SetPINScreen;
