import React, { useState } from 'react';
import { View, Text, Animated, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { Shield, Info, CheckCircle } from 'lucide-react-native';
import { useSignUp } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PINPad from '../../components/shared/PINPad';
import apiClient, { setActiveTokens } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { GlassSurface } from '../../components/glass/GlassSurface';

const SetPINScreen = ({ route, navigation }: any) => {
  const { phone, otp, full_name, clerk_user_id } = route.params;
  const login = useAuthStore((state) => state.login);
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const { isLoaded, signUp } = useSignUp();
  
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
            verifyMutation.mutate({ phone, pin: newConfirmPin });
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
    mutationFn: (data: { phone: string, pin: string }) => {
      const resolvedClerkUserId = clerk_user_id || signUp?.createdUserId;
      if (!resolvedClerkUserId) {
        throw new Error('Authentication session is missing. Please restart registration.');
      }
      const payload = {
        phone: data.phone,
        pin: data.pin,
        full_name: full_name,
        clerk_user_id: resolvedClerkUserId,
      };
      console.log('[SetPIN Clerk] Posting to /auth/register/clerk with:', JSON.stringify(payload));
      return apiClient.post('/auth/register/clerk', payload);
    },
    onSuccess: async (response, variables) => {
      console.log('[SetPIN Clerk] Success:', JSON.stringify(response.data));
      const { access_token, refresh_token, user } = response.data;
      
      // Store session tokens using the active session helper (crucial for switcher to function)
      await setActiveTokens(user.phone || phone, access_token, refresh_token);
      
      // Save PIN in SecureStore for multi-account switches and biometrics
      const sanitizedPhone = (user.phone || phone).replace(/[^\w.-]/g, '');
      await SecureStore.setItemAsync(`user_pin_${sanitizedPhone}`, variables.pin);
      
      // Check for pending trial activation
      try {
        const startTrialOptIn = await AsyncStorage.getItem('pending_trial_opt_in');
        if (startTrialOptIn === 'true') {
          await AsyncStorage.removeItem('pending_trial_opt_in');
          console.log('[SetPIN Clerk] Activating pending free trial...');
          const trialResponse = await apiClient.post('/billing/start-trial');
          console.log('[SetPIN Clerk] Trial active:', JSON.stringify(trialResponse.data));
          login(trialResponse.data);
          return;
        }
      } catch (trialErr) {
        console.warn('[SetPIN Clerk] Failed to activate pending trial:', trialErr);
      }
      
      login(user);
    },
    onError: (err: any) => {
      console.warn('[SetPIN Clerk] Error status:', err?.response?.status);
      console.warn('[SetPIN Clerk] Error data:', JSON.stringify(err?.response?.data));
      console.warn('[SetPIN Clerk] Error message:', err?.message);
      if (err?.config?.baseURL) {
        console.warn('[SetPIN Clerk] Request URL:', err.config.baseURL + (err.config.url || ''));
      }
      const rawError = err?.response?.data?.error;
      const errorCode = typeof rawError === 'object' ? rawError?.code : err?.response?.data?.error_code;
      const errorMsg =
        typeof rawError === 'string'
          ? rawError
          : rawError?.message || err?.response?.data?.detail || err?.message || 'Verification failed.';

      if (
        err?.response?.status === 409 ||
        errorCode === 'PHONE_ALREADY_REGISTERED' ||
        errorMsg.toLowerCase().includes('already registered')
      ) {
        Alert.alert(
          'Account Already Exists',
          'This mobile number is already registered on CediSmart. Please log in with your PIN.',
          [
            {
              text: 'Go to Login',
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
        setError('Number already registered.');
      } else if (
        err?.code === 'ECONNABORTED' ||
        err?.message?.toLowerCase().includes('timeout') ||
        err?.message?.toLowerCase().includes('network')
      ) {
        setError('Server is waking up. Please enter your PIN once more to finish.');
      } else {
        setError(errorMsg);
      }
      setPin('');
      setConfirmPin('');
      setStep('create');
      shake();
    }
  });

  const renderDots = () => {
    const currentPin = step === 'create' ? pin : confirmPin;
    return (
      <GlassSurface variant="clear" radius={999} style={{ paddingHorizontal: 20, paddingVertical: 10, marginBottom: 12 }}>
        <View className="flex-row justify-center items-center">
          {[...Array(6)].map((_, i) => (
            <View
              key={i}
              className={`w-3.5 h-3.5 rounded-full mx-2 ${
                i < currentPin.length
                  ? isDark ? 'bg-[#4ade80] scale-125' : 'bg-primary scale-125'
                  : isDark
                  ? 'bg-white/25'
                  : 'bg-black/15'
              }`}
            />
          ))}
        </View>
      </GlassSurface>
    );
  };

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
      <CoinBackground />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        className="px-6 py-2"
      >
        {/* Header Section */}
        <View className="items-center mt-1">
          <GlassSurface
            tint="emerald"
            radius={999}
            elevated
            style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}
          >
            <Shield size={24} color={isDark ? '#4ade80' : '#0d631b'} fill={isDark ? 'rgba(74,222,128,0.25)' : 'rgba(13,99,27,0.18)'} />
          </GlassSurface>
          <Text className={`font-headline font-extrabold text-2xl text-center ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} mb-1 tracking-tight`}>
            Secure Your Account
          </Text>
          <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-medium text-xs text-center leading-relaxed px-4 max-w-[320px]`}>
            Set up a 6-digit transaction PIN to protect your wealth and authorize transfers safely.
          </Text>
        </View>

        {/* PIN Status */}
        <Animated.View 
          style={{ transform: [{ translateX: shakeAnimation }] }}
          className="items-center my-2"
        >
          <Text className={`font-label text-xs uppercase tracking-widest ${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold mb-2`}>
            {step === 'create' ? 'Enter PIN' : 'Confirm PIN'}
          </Text>
          {renderDots()}
          
          <View className={`flex-row items-center space-x-2 px-4 transition-opacity ${error ? 'opacity-100' : 'opacity-0'}`}>
            <Info size={14} color="#ba1a1a" />
            <Text className="font-label text-xs font-semibold text-error text-center ml-1.5">{error}</Text>
          </View>
        </Animated.View>

        {/* PINPad */}
        <View className="pb-1">
          <PINPad 
            onPress={handlePress} 
            onBackspace={handleBackspace} 
            disabled={verifyMutation.isPending}
          />
          <View className="mt-3 items-center opacity-30">
            <Text className={`font-headline font-black ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-widest text-[9px] uppercase`}>
              CediSmart Secure Layer
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Confirmation Overlay */}
      {verifyMutation.isPending && (
        <View className={`absolute top-0 left-0 right-0 bottom-0 w-full h-full ${isDark ? 'bg-dark-background/70' : 'bg-surface/50'} items-center justify-center z-50`}>
          <GlassSurface variant="thick" elevated radius={28} style={{ padding: 36, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={isDark ? '#4ade80' : '#0d631b'} />
            <Text className={`mt-4 font-headline font-bold text-lg ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Verifying...</Text>
          </GlassSurface>
        </View>
      )}
    </SafeAreaView>
  );
};

export default SetPINScreen;
