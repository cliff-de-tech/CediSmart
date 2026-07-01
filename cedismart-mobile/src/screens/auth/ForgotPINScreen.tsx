import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Animated, Alert } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useSignIn, useAuth } from '@clerk/clerk-expo';
import { Shield, ArrowRight, Lock, Clock, ArrowLeft, KeyRound, HelpCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PINPad from '../../components/shared/PINPad';
import apiClient from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { SupportModal } from '../../components/shared/SupportModal';

// Helper to normalize phone
const normalizePhoneNumber = (phone: string): string => {
  if (!phone) return '';
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.startsWith('+233')) return clean;
  if (clean.startsWith('233')) return `+${clean}`;
  if (clean.startsWith('0')) return `+233${clean.substring(1)}`;
  return `+233${clean}`;
};

const ForgotPINScreen = ({ navigation }: any) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const { isLoaded, signIn, setActive } = useSignIn();
  const { userId, signOut } = useAuth();

  const [step, setStep] = useState<'phone' | 'otp' | 'pin'>('phone');
  const [supportVisible, setSupportVisible] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(300);
  const [pinStep, setPinStep] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  
  const [error, setError] = useState('');
  const shakeAnimation = useState(new Animated.Value(0))[0];
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'otp') {
      interval = setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Step 1: Send OTP
  const sendOtpMutation = useMutation({
    mutationFn: async () => {
      if (!isLoaded || !signIn) {
        throw new Error('SignIn service not loaded yet. Please try again.');
      }

      if (userId) {
        console.log('[ForgotPIN Clerk] Active session detected. Signing out first...');
        await signOut();
      }

      const formattedPhone = normalizePhoneNumber(phone);
      console.log('[ForgotPIN Clerk] Starting signIn/reset for:', formattedPhone);

      // Start sign in
      const result = await signIn.create({
        identifier: formattedPhone,
      });

      const phoneCodeFactor = result.supportedFirstFactors?.find(
        (f: any) => f.strategy === 'phone_code'
      ) as any;

      if (!phoneCodeFactor) {
        throw new Error('SMS verification factor not available for this number.');
      }

      await signIn.prepareFirstFactor({
        strategy: 'phone_code',
        phoneNumberId: phoneCodeFactor.phoneNumberId,
      });

      return formattedPhone;
    },
    onSuccess: (formattedPhone) => {
      console.log('[ForgotPIN Clerk] Verification initiated');
      setStep('otp');
      setTimer(300);
      setError('');
    },
    onError: (err: any) => {
      console.warn('[ForgotPIN Clerk] Error initiating:', err);
      const errorMsg = err?.errors?.[0]?.message || err?.message || 'Failed to start verification. Please try again.';
      setError(errorMsg);
    }
  });

  // Step 2: Verify OTP
  const verifyOtpMutation = useMutation({
    mutationFn: async (otpCode: string) => {
      if (!isLoaded || !signIn) {
        throw new Error('SignIn service not loaded yet. Please try again.');
      }
      console.log('[ForgotPIN Clerk] Attempting first factor verification with code:', otpCode);
      const result = await signIn.attemptFirstFactor({
        strategy: 'phone_code',
        code: otpCode,
      });
      return result;
    },
    onSuccess: async (result) => {
      console.log('[ForgotPIN Clerk] Phone verified successfully. Status:', result.status);
      if (result.status === 'complete') {
        // Set session active to login the Clerk user
        if (setActive) {
          await setActive({ session: result.createdSessionId });
        }
        setStep('pin');
        setPinStep('create');
        setError('');
      } else {
        setError('Verification failed. Status not complete.');
      }
    },
    onError: (err: any) => {
      console.warn('[ForgotPIN Clerk] Verification error:', err);
      const errorMsg = err?.errors?.[0]?.message || err?.message || 'Invalid code. Please try again.';
      setError(errorMsg);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  });

  // Step 3: Set PIN and Save
  const resetPinMutation = useMutation({
    mutationFn: async (newPin: string) => {
      const formattedPhone = normalizePhoneNumber(phone);
      if (!userId) {
        throw new Error('Authentication session is missing. Please restart reset flow.');
      }
      const payload = {
        phone: formattedPhone,
        new_pin: newPin,
        clerk_user_id: userId,
      };
      console.log('[ForgotPIN Clerk] Resetting PIN on backend:', JSON.stringify(payload));
      return apiClient.post('/auth/pin/reset/confirm', payload);
    },
    onSuccess: async (response) => {
      console.log('[ForgotPIN Clerk] Success:', JSON.stringify(response.data));
      // Log out of Clerk so they are not authenticated yet (must log in via PIN)
      try {
        await signOut();
      } catch (e) {
        console.warn('[ForgotPIN Clerk] Sign out failed (non-fatal):', e);
      }
      Alert.alert('Success', 'PIN updated successfully. Please log in with your new PIN.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') }
      ]);
    },
    onError: (err: any) => {
      console.warn('[ForgotPIN Clerk] Reset backend error:', err);
      const serverError = err?.response?.data?.error;
      const errorMsg = typeof serverError === 'string'
        ? serverError
        : serverError?.message || 'Failed to update PIN on server. Please try again.';
      setError(errorMsg);
      setPin('');
      setConfirmPin('');
      setPinStep('create');
      shake();
    }
  });

  const handleOtpChange = (value: string, index: number) => {
    setError('');
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value !== '' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === 5 && value !== '' && newOtp.every(digit => digit !== '')) {
      const fullOtp = newOtp.join('');
      setTimeout(() => verifyOtpMutation.mutate(fullOtp), 200);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePinPress = (digit: string) => {
    setError('');
    if (pinStep === 'create') {
      if (pin.length < 6) {
        const newPin = pin + digit;
        setPin(newPin);
        if (newPin.length === 6) {
          if (/^(\d)\1+$/.test(newPin)) {
            setError('PIN is too simple. Try another.');
            setPin('');
            shake();
          } else {
            setTimeout(() => setPinStep('confirm'), 400);
          }
        }
      }
    } else {
      if (confirmPin.length < 6) {
        const newConfirmPin = confirmPin + digit;
        setConfirmPin(newConfirmPin);
        if (newConfirmPin.length === 6) {
          if (newConfirmPin === pin) {
            resetPinMutation.mutate(newConfirmPin);
          } else {
            setError('PINs do not match. Start over.');
            setPin('');
            setConfirmPin('');
            setPinStep('create');
            shake();
          }
        }
      }
    }
  };

  const handlePinBackspace = () => {
    if (pinStep === 'create') {
      setPin(pin.slice(0, -1));
    } else {
      setConfirmPin(confirmPin.slice(0, -1));
    }
  };

  // Render Step 1: Phone input
  if (step === 'phone') {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
        <CoinBackground />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6">
            {/* Top Back Action */}
            <TouchableOpacity onPress={() => navigation.goBack()} className="pt-6 pb-2">
              <View className={`w-10 h-10 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} items-center justify-center`}>
                <ArrowLeft size={20} color={isDark ? '#e1e3e0' : '#1c1b1f'} />
              </View>
            </TouchableOpacity>

            <View className="pt-8 mb-12">
              <Text className="font-label text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Recover Account</Text>
              <Text className={`font-headline text-4xl font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight leading-tight`}>Forgot PIN</Text>
              <Text className={`font-body ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mt-4 text-sm leading-relaxed max-w-[280px]`}>
                Enter your registered phone number to verify your identity.
              </Text>
            </View>

            <View className={`w-full ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-lowest'} rounded-3xl p-8 shadow-sm`}>
              <View className="space-y-6">
                <View className="space-y-3">
                  <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Phone Number</Text>
                  <View className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} rounded-2xl overflow-hidden h-14 border ${isDark ? 'border-dark-outline-variant/20' : 'border-transparent'}`}>
                    <View className={`flex-row items-center px-4 ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-high'} h-full border-r ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}>
                      <Text className={`font-body font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>+233</Text>
                    </View>
                    <TextInput
                      className={`flex-1 h-full px-4 font-body text-lg tracking-widest ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}
                      placeholder="XXXXXXXXX"
                      placeholderTextColor={isDark ? '#434942' : '#D1D5DB'}
                      keyboardType="phone-pad"
                      maxLength={9}
                      value={phone}
                      onChangeText={(text) => {
                        setError('');
                        setPhone(text);
                      }}
                    />
                  </View>
                </View>

                {error ? (
                  <Text className="text-error text-xs font-semibold text-center mb-2">{error}</Text>
                ) : null}

                <TouchableOpacity
                  onPress={() => sendOtpMutation.mutate()}
                  disabled={phone.length < 9 || sendOtpMutation.isPending}
                  className="overflow-hidden rounded-2xl shadow-lg shadow-primary/20"
                >
                  <View className={`w-full h-14 items-center justify-center flex-row space-x-3 ${phone.length < 9 || sendOtpMutation.isPending ? (isDark ? 'bg-dark-surface-container-low' : 'bg-gray-300') : 'bg-primary'}`}>
                    <Text className="text-white font-headline font-bold text-base">
                      {sendOtpMutation.isPending ? 'Sending...' : 'Send OTP'}
                    </Text>
                    <ArrowRight size={20} color="white" />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        {/* Support Action */}
        <View className="absolute bottom-10 right-8">
          <TouchableOpacity 
            onPress={() => setSupportVisible(true)}
            className={`flex-row items-center space-x-2 ${isDark ? 'bg-dark-surface-container-lowest/80' : 'bg-surface-container-lowest/80'} px-4 py-3 rounded-full shadow-lg border ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}
          >
            <HelpCircle size={20} color={isDark ? '#2e7d32' : '#0d631b'} />
            <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-[#2e7d32]' : 'text-primary'}`}>Support</Text>
          </TouchableOpacity>
        </View>

        <SupportModal
          visible={supportVisible}
          onClose={() => setSupportVisible(false)}
          phone={phone ? `+233${phone}` : undefined}
          supportType="auth"
        />
      </SafeAreaView>
    );
  }

  // Render Step 2: OTP verify
  if (step === 'otp') {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
        <CoinBackground />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-8">
            <TouchableOpacity onPress={() => setStep('phone')} className="pt-6 pb-2">
              <View className={`w-10 h-10 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} items-center justify-center`}>
                <ArrowLeft size={20} color={isDark ? '#e1e3e0' : '#1c1b1f'} />
              </View>
            </TouchableOpacity>

            <View className="flex-1 justify-center items-center py-6">
              <View className={`w-20 h-20 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} items-center justify-center mb-8 shadow-sm`}>
                <Lock size={32} color={isDark ? '#2e7d32' : '#0d631b'} fill={isDark ? '#2e7d32' : '#0d631b'} opacity={0.8} />
              </View>

              <Text className={`font-headline font-extrabold text-3xl ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight mb-2`}>Security Check</Text>
              <Text className={`font-body ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} leading-relaxed text-center mb-6`}>
                OTP sent to <Text className={`font-semibold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>{normalizePhoneNumber(phone)}</Text>
              </Text>

              <View className="flex-row justify-between w-full mb-10">
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    className={`w-[14%] aspect-square ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-lowest'} border ${isDark ? 'border-dark-outline-variant/30' : 'border-outline-variant/20'} rounded-xl text-center font-headline font-bold text-2xl ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} shadow-sm`}
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

              <View className="items-center space-y-4 mb-12">
                <View className={`flex-row items-center space-x-2 px-4 py-2 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} border ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}>
                  <Clock size={14} color={isDark ? '#2e7d32' : '#0d631b'} />
                  <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>
                    Resend in {formatTime(timer)}
                  </Text>
                </View>
                
                <TouchableOpacity 
                  onPress={() => timer === 0 && sendOtpMutation.mutate()} 
                  disabled={timer > 0 || sendOtpMutation.isPending}
                >
                  <Text className={`font-label text-sm font-bold ${timer > 0 ? 'text-primary opacity-30' : 'text-primary'}`}>
                    Resend Code
                  </Text>
                </TouchableOpacity>
              </View>

              {error ? (
                <Text className="text-error text-sm font-semibold mb-4 text-center">{error}</Text>
              ) : null}

              <TouchableOpacity
                onPress={() => {
                  if (!otp.some(d => d === '')) {
                    verifyOtpMutation.mutate(otp.join(''));
                  }
                }}
                disabled={otp.some(d => d === '') || verifyOtpMutation.isPending}
                className="w-full h-14 rounded-2xl overflow-hidden shadow-lg shadow-primary/10"
              >
                <View className={`w-full h-full items-center justify-center flex-row space-x-2 ${
                  otp.some(d => d === '') || verifyOtpMutation.isPending 
                    ? (isDark ? 'bg-dark-surface-container-low' : 'bg-gray-300') 
                    : 'bg-primary'
                }`}>
                  <Text className="text-white font-headline font-bold text-base">
                    {verifyOtpMutation.isPending ? 'Verifying...' : 'Verify'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        {/* Support Action */}
        <View className="absolute bottom-10 right-8">
          <TouchableOpacity 
            onPress={() => setSupportVisible(true)}
            className={`flex-row items-center space-x-2 ${isDark ? 'bg-dark-surface-container-lowest/80' : 'bg-surface-container-lowest/80'} px-4 py-3 rounded-full shadow-lg border ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}
          >
            <HelpCircle size={20} color={isDark ? '#2e7d32' : '#0d631b'} />
            <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-[#2e7d32]' : 'text-primary'}`}>Support</Text>
          </TouchableOpacity>
        </View>

        <SupportModal
          visible={supportVisible}
          onClose={() => setSupportVisible(false)}
          phone={phone ? `+233${phone}` : undefined}
          supportType="auth"
        />
      </SafeAreaView>
    );
  }

  // Render Step 3: PIN setting
  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
      <CoinBackground />
      <View className="flex-1 px-8 py-6">
        <View className="items-center mb-6 pt-10">
          <View className={`w-16 h-16 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} items-center justify-center mb-6 shadow-sm`}>
            <KeyRound size={28} color={isDark ? '#2e7d32' : '#0d631b'} />
          </View>

          <Text className={`font-headline font-extrabold text-3xl ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight mb-2`}>
            {pinStep === 'create' ? 'Create New PIN' : 'Confirm New PIN'}
          </Text>
          <Text className={`font-body ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} text-center px-4 leading-relaxed`}>
            {pinStep === 'create'
              ? 'Choose a highly secure 6-digit PIN to lock and secure your ledger data.'
              : 'Re-enter your 6-digit PIN to ensure it is correctly set.'}
          </Text>
        </View>

        {/* PIN Indicators */}
        <Animated.View 
          style={{ transform: [{ translateX: shakeAnimation }] }}
          className="flex-row justify-center space-x-4 mb-8"
        >
          {Array(6).fill(0).map((_, i) => {
            const isFilled = pinStep === 'create' ? i < pin.length : i < confirmPin.length;
            return (
              <View
                key={i}
                className={`w-4 h-4 rounded-full border ${
                  isFilled
                    ? 'bg-primary border-primary scale-110'
                    : isDark
                    ? 'border-dark-outline-variant/40 bg-transparent'
                    : 'border-outline-variant/30 bg-transparent'
                }`}
              />
            );
          })}
        </Animated.View>

        {error ? (
          <Text className="text-error text-sm font-semibold mb-6 text-center">{error}</Text>
        ) : null}

        {resetPinMutation.isPending && (
          <View className="items-center mb-6">
            <Text className={`font-body text-xs ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>
              Saving your new PIN securely...
            </Text>
          </View>
        )}

        {/* PIN Pad */}
        <View className="flex-1 justify-end pb-8">
          <PINPad
            onPress={handlePinPress}
            onBackspace={handlePinBackspace}
            disabled={resetPinMutation.isPending}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

export default ForgotPINScreen;
