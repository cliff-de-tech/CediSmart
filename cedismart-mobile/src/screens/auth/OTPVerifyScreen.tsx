import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Shield, ArrowRight, Lock, Clock, HelpCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import apiClient, { setActiveTokens } from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import { CoinBackground } from '../../components/shared/CoinBackground';

const OTPVerifyScreen = ({ route, navigation }: any) => {
  const { phone, flow = 'register', pin } = route.params;
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const { login } = useAuthStore();
  const [verifyError, setVerifyError] = useState('');

  const [step, setStep] = useState<'otp' | 'details'>('otp');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(300);
  const [title, setTitle] = useState<'Mr.' | 'Mrs.' | 'Ms.' | 'None'>('Mr.');
  const [fullName, setFullName] = useState('');
  
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOtpChange = (value: string, index: number) => {
    setVerifyError('');
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value !== '' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === 5 && value !== '' && newOtp.every(digit => digit !== '')) {
      const fullOtp = newOtp.join('');
      if (flow === 'login') {
        setTimeout(() => loginOtpMutation.mutate(fullOtp), 200);
      } else {
        setTimeout(() => setStep('details'), 400);
      }
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const resendMutation = useMutation({
    mutationFn: () => {
      if (flow === 'login') {
        return apiClient.post('/auth/login/initiate', { phone, pin });
      }
      return apiClient.post('/auth/register/initiate', { phone });
    },
    onSuccess: () => {
      setTimer(300);
      setVerifyError('');
    },
    onError: (err: any) => {
      console.error('[Resend OTP] Failed:', err?.response?.data || err);
      const serverError = err?.response?.data?.error;
      const errorMsg = typeof serverError === 'string'
        ? serverError
        : serverError?.message || 'Failed to resend code. Please try again.';
      setVerifyError(errorMsg);
    }
  });

  const loginOtpMutation = useMutation({
    mutationFn: (otpCode: string) => {
      return apiClient.post('/auth/login/verify', { phone, otp: otpCode });
    },
    onSuccess: async (response) => {
      const { access_token, refresh_token, user } = response.data;
      
      // Store session tokens using the active session helper
      await setActiveTokens(user.phone || phone, access_token, refresh_token);
      
      // Save PIN in SecureStore for biometric convenience
      if (pin) {
        const sanitizedPhone = (user.phone || phone).replace(/[^\w.-]/g, '');
        await SecureStore.setItemAsync(`user_pin_${sanitizedPhone}`, pin);
      }
      
      // Trigger local login to hydrate state
      login(user);
    },
    onError: (err: any) => {
      console.error('[Login OTP Verify] Failed:', err?.response?.data || err);
      const serverError = err?.response?.data?.error;
      const errorMsg = typeof serverError === 'string' 
        ? serverError 
        : serverError?.message || 'Verification failed. Please check the code.';
      setVerifyError(errorMsg);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  });

  if (step === 'details') {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
        <CoinBackground />
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-8">
            {/* Decoration Layer */}
            <View className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />
            
            <View className="flex-1 justify-center py-12">
              <View className="mb-10">
                <Text className="font-label text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Sovereign Identity</Text>
                <Text className={`font-headline text-4xl font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight leading-tight`}>About You</Text>
                <Text className={`font-body ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mt-4 text-sm leading-relaxed`}>Help us personalize your ledger experience.</Text>
              </View>

              <View className={`${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-lowest'} rounded-3xl p-8 shadow-sm`}>
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-4`}>Title</Text>
                <View className="flex-row space-x-2 mb-8">
                  {(['Mr.', 'Mrs.', 'Ms.', 'None'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setTitle(t)}
                      className={`flex-1 py-3 items-center rounded-xl border ${title === t ? 'bg-primary border-primary shadow-sm shadow-primary/20' : `${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}`}
                    >
                      <Text className={`font-label text-xs font-bold ${title === t ? 'text-white' : isDark ? 'text-gray-500' : 'text-gray-400'}`}>{t === 'None' ? 'N/A' : t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View className="mb-10">
                  <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-4`}>Full Name</Text>
                  <TextInput
                    className={`${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} px-5 py-4 rounded-2xl font-body text-lg ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} border ${isDark ? 'border-dark-outline-variant/20' : 'border-transparent'}`}
                    placeholder="e.g. Kofi Mensah"
                    placeholderTextColor={isDark ? '#434942' : '#D1D5DB'}
                    value={fullName}
                    onChangeText={setFullName}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  onPress={() => navigation.navigate('SetPIN', { 
                    phone, 
                    otp: otp.join(''), 
                    full_name: title === 'None' ? fullName : `${title} ${fullName}` 
                  })}
                  disabled={!fullName.trim()}
                  className="overflow-hidden rounded-2xl shadow-lg shadow-primary/20"
                >
                  <View className={`w-full h-14 items-center justify-center flex-row space-x-3 ${!fullName.trim() ? (isDark ? 'bg-dark-surface-container-low' : 'bg-gray-300') : 'bg-primary'}`}>
                    <Text className="text-white font-headline font-bold text-base">Continue</Text>
                    <ArrowRight size={20} color="white" />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
      <CoinBackground />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-8">
          {/* Decoration Layer */}
          <View className="absolute top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
          <View className="absolute bottom-10 -left-20 w-80 h-80 bg-secondary/5 rounded-full blur-3xl" />
          
          <View className="flex-1 justify-center items-center py-12">
            {/* Lock Icon */}
            <View className={`w-20 h-20 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} items-center justify-center mb-8 shadow-sm`}>
              <Lock size={32} color={isDark ? '#2e7d32' : '#0d631b'} fill={isDark ? '#2e7d32' : '#0d631b'} opacity={0.8} />
            </View>

            <Text className={`font-headline font-extrabold text-3xl ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight mb-2`}>Security Check</Text>
            <Text className={`font-body ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} leading-relaxed text-center mb-6`}>
              OTP sent to <Text className={`font-semibold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>{phone}</Text>
            </Text>

            {/* Beta Banner */}
            <View className={`w-full mb-8 p-4 rounded-2xl border ${isDark ? 'bg-dark-surface-container-low border-primary/20' : 'bg-primary/5 border-primary/10'} flex-row items-center space-x-3`}>
              <Shield size={20} color={isDark ? '#4ade80' : '#0A6E4A'} />
              <View className="flex-1">
                <Text className={`font-body text-xs leading-relaxed ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>
                  We are in <Text className="font-bold text-primary">Beta mode</Text>. Please enter the bypass code <Text className="font-bold text-primary">123456</Text> to verify.
                </Text>
              </View>
            </View>

            {/* OTP Input Grid */}
            <View className="flex-row justify-between w-full mb-10">
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  className={`w-[14%] aspect-square ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-lowest'} border ${isDark ? 'border-dark-outline-variant/30' : 'border-outline-variant/20'} rounded-xl text-center font-headline font-bold text-2xl ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} shadow-sm ${isDark ? 'focus:border-[#2e7d32]' : 'focus:border-primary'}`}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  placeholder={digit === '' ? '•' : ''}
                  placeholderTextColor={isDark ? '#434942' : '#D1D5DB'}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  autoFocus={index === 0}
                />
              ))}
            </View>

            {/* Timer & Action */}
            <View className="items-center space-y-4 mb-12">
              <View className={`flex-row items-center space-x-2 px-4 py-2 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} border ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}>
                <Clock size={14} color={isDark ? '#2e7d32' : '#0d631b'} />
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>
                  Resend in {formatTime(timer)}
                </Text>
              </View>
              
              <TouchableOpacity 
                onPress={() => timer === 0 && resendMutation.mutate()} 
                disabled={timer > 0 || resendMutation.isPending}
              >
                <Text className={`font-label text-sm font-bold ${timer > 0 ? 'text-primary opacity-30' : 'text-primary'}`}>
                  Resend Code
                </Text>
              </TouchableOpacity>
            </View>

            {verifyError ? (
              <Text className="text-error text-sm font-semibold mb-4 text-center">{verifyError}</Text>
            ) : null}

            <TouchableOpacity
              onPress={() => {
                if (!otp.some(d => d === '')) {
                  if (flow === 'login') {
                    loginOtpMutation.mutate(otp.join(''));
                  } else {
                    setStep('details');
                  }
                }
              }}
              disabled={otp.some(d => d === '') || loginOtpMutation.isPending}
              className="w-full h-14 rounded-2xl overflow-hidden shadow-lg shadow-primary/10"
            >
              <View className={`w-full h-full items-center justify-center flex-row space-x-2 ${
                otp.some(d => d === '') || loginOtpMutation.isPending 
                  ? (isDark ? 'bg-dark-surface-container-low' : 'bg-gray-300') 
                  : 'bg-primary'
              }`}>
                <Text className={`font-headline font-bold text-base ${
                  otp.some(d => d === '') || loginOtpMutation.isPending 
                    ? (isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant') 
                    : 'text-white'
                }`}>
                  {loginOtpMutation.isPending ? 'Verifying...' : 'Verify'}
                </Text>
                {!loginOtpMutation.isPending && (
                  <ArrowRight size={18} color={otp.some(d => d === '') ? (isDark ? '#b2b6b1' : '#40493d') : 'white'} />
                )}
              </View>
            </TouchableOpacity>

            <Text className={`text-center font-body text-[10px] ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} px-8 mt-6`}>
              By verifying, you agree to CediSmart's <Text className={`${isDark ? 'text-[#2e7d32]' : 'text-primary'} font-bold`}>Terms of Service</Text> and <Text className={`${isDark ? 'text-[#2e7d32]' : 'text-primary'} font-bold`}>Privacy Policy</Text>.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Support Action */}
      <View className="absolute bottom-10 right-8">
        <TouchableOpacity className={`flex-row items-center space-x-2 ${isDark ? 'bg-dark-surface-container-lowest/80' : 'bg-surface-container-lowest/80'} px-4 py-3 rounded-full shadow-lg border ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}>
          <HelpCircle size={20} color={isDark ? '#2e7d32' : '#0d631b'} />
          <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-[#2e7d32]' : 'text-primary'}`}>Support</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default OTPVerifyScreen;
