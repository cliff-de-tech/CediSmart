import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Animated, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import PINPad from '../../components/shared/PINPad';
import apiClient from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

const LoginScreen = ({ navigation }: any) => {
  const login = useAuthStore((state) => state.login);
  
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
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
    if (phone.length < 9) {
      setPhone(phone + digit);
    } else if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 6) {
        loginMutation.mutate({ phone: `+233${phone}`, pin: newPin });
      }
    }
  };

  const handleBackspace = () => {
    setError('');
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
    } else if (phone.length > 0) {
      setPhone(phone.slice(0, -1));
    }
  };

  const loginMutation = useMutation({
    mutationFn: (data: { phone: string, pin: string }) => {
      return apiClient.post('/auth/login', data);
    },
    onSuccess: async (response) => {
      const { access_token, refresh_token, user } = response.data;
      await SecureStore.setItemAsync('access_token', access_token);
      await SecureStore.setItemAsync('refresh_token', refresh_token);
      login(user);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || 'Invalid credentials.');
      setPin('');
      shake();
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6">
          <View className="flex-1 justify-center">
            <Animated.View 
              style={{ transform: [{ translateX: shakeAnimation }] }}
              className="items-center"
            >
              <Text className="text-3xl font-bold text-charcoal mb-2">Welcome Back</Text>
              <Text className="text-gray-500 mb-8 text-center text-lg">Enter your details to login.</Text>

              <View className="w-full mb-8">
                <Text className="text-sm font-medium text-gray-700 mb-2 ml-1">Phone Number</Text>
                <View className="flex-row items-center border-b-2 border-gray-200 py-2 focus:border-primary">
                  <Text className="text-xl text-charcoal mr-2 font-medium">+233</Text>
                  <Text className={`flex-1 text-xl font-medium ${phone ? 'text-charcoal' : 'text-gray-400'}`}>
                    {phone || '24XXXXXXX'}
                  </Text>
                </View>
              </View>

              <View className="flex-row justify-center space-x-4 mb-4">
                {[...Array(6)].map((_, i) => (
                  <View
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 border-primary ${i < pin.length ? 'bg-primary' : 'bg-transparent'}`}
                  />
                ))}
              </View>

              {error ? (
                <Text className="text-error text-sm mb-4 text-center">{error}</Text>
              ) : null}
            </Animated.View>

            <PINPad 
              onPress={handlePress} 
              onBackspace={handleBackspace} 
              disabled={loginMutation.isPending}
            />

            <View className="mt-4 flex-row justify-center">
              <Text className="text-gray-500">Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text className="text-primary font-bold">Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;
