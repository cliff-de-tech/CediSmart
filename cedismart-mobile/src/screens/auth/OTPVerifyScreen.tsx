import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Shield, ArrowRight, Lock, Clock, HelpCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignUp } from '@clerk/clerk-expo';
import apiClient from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { SupportModal } from '../../components/shared/SupportModal';
import { GlassSurface } from '../../components/glass/GlassSurface';

const OTPVerifyScreen = ({ route, navigation }: any) => {
  const { phone, flow = 'register', pin } = route.params;
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const { isLoaded, signUp } = useSignUp();
  const [verifyError, setVerifyError] = useState('');

  const [step, setStep] = useState<'otp' | 'details'>('otp');
  const [supportVisible, setSupportVisible] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(300);
  const [title, setTitle] = useState<'Mr.' | 'Mrs.' | 'Ms.' | 'None'>('Mr.');
  const [fullName, setFullName] = useState('');
  const [clerkUserId, setClerkUserId] = useState<string | null>(null);
  
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
    const cleaned = value.trim();
    
    // Check if user auto-filled or pasted a full code (length > 1)
    if (cleaned.length > 1) {
      const codeDigits = cleaned.slice(0, 6).split('');
      const newOtp = [...otp];
      for (let i = 0; i < 6; i++) {
        newOtp[i] = codeDigits[i] || '';
      }
      setOtp(newOtp);
      
      const lastIndex = Math.min(codeDigits.length - 1, 5);
      inputRefs.current[lastIndex]?.focus();
      
      if (codeDigits.length === 6) {
        const fullOtp = codeDigits.join('');
        setTimeout(() => verifyOtpMutation.mutate(fullOtp), 200);
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = cleaned;
    setOtp(newOtp);

    if (cleaned !== '' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === 5 && cleaned !== '' && newOtp.every(digit => digit !== '')) {
      const fullOtp = newOtp.join('');
      setTimeout(() => verifyOtpMutation.mutate(fullOtp), 200);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const resendMutation = useMutation({
    mutationFn: async () => {
      if (!isLoaded) {
        throw new Error('Verification service not loaded yet. Please try again.');
      }
      console.log('[OTPVerify Clerk] Resending verification code');
      await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
    },
    onSuccess: () => {
      setTimer(300);
      setVerifyError('');
    },
    onError: (err: any) => {
      console.error('[OTPVerify Clerk] Resend failed:', err);
      const errorMsg = err?.errors?.[0]?.message || err?.message || 'Failed to resend code. Please try again.';
      setVerifyError(errorMsg);
    }
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (otpCode: string) => {
      if (!isLoaded) {
        throw new Error('Verification service not loaded yet. Please try again.');
      }
      
      console.log('[OTPVerify Clerk] Attempting verification code:', otpCode);
      const result = await signUp.attemptPhoneNumberVerification({
        code: otpCode,
      });
      return result;
    },
    onSuccess: (result) => {
      console.log('[OTPVerify Clerk] Phone verified successfully. Status:', result.status);
      console.log('[OTPVerify Clerk] Missing fields:', JSON.stringify(result.missingFields));
      if (result.status === 'complete') {
        setClerkUserId(result.createdUserId || null);
      }
      // If status is 'missing_requirements', we'll finalize after the user enters their name
      setStep('details');
    },
    onError: (err: any) => {
      console.warn('[OTPVerify Clerk] Verification failed:', err?.errors?.[0]?.message || err?.message);
      const errorMsg = err?.errors?.[0]?.message || err?.message || 'Verification failed. Please check the code.';
      setVerifyError(errorMsg);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  });

  const [isFinalizingSignUp, setIsFinalizingSignUp] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const handleContinueToPin = async () => {
    if (!fullName.trim()) return;

    const composedName = title === 'None' ? fullName : `${title} ${fullName}`;
    
    // If we already have a clerk user ID (status was 'complete'), navigate directly
    if (clerkUserId) {
      navigation.navigate('SetPIN', { 
        phone, 
        otp: otp.join(''), 
        full_name: composedName,
        clerk_user_id: clerkUserId,
      });
      return;
    }

    // Otherwise, finalize the sign-up by providing missing fields (name)
    if (!isLoaded || !signUp) {
      setDetailsError('Verification service not available. Please restart registration.');
      return;
    }

    setIsFinalizingSignUp(true);
    setDetailsError('');

    try {
      // Split name into first/last for Clerk
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || fullName;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      console.log('[OTPVerify Clerk] Finalizing sign-up with name:', firstName, lastName);
      const result = await signUp.update({
        firstName,
        lastName: lastName || undefined,
      });

      console.log('[OTPVerify Clerk] Sign-up finalized. Status:', result.status, 'UserID:', result.createdUserId);

      if (result.status === 'complete' && result.createdUserId) {
        navigation.navigate('SetPIN', { 
          phone, 
          otp: otp.join(''), 
          full_name: composedName,
          clerk_user_id: result.createdUserId,
        });
      } else {
        console.warn('[OTPVerify Clerk] Still missing requirements:', JSON.stringify(result.missingFields));
        setDetailsError('Additional verification required. Please contact support.');
      }
    } catch (err: any) {
      console.warn('[OTPVerify Clerk] Finalize error:', err?.errors?.[0]?.message || err?.message);
      setDetailsError(err?.errors?.[0]?.message || err?.message || 'Failed to complete registration.');
    } finally {
      setIsFinalizingSignUp(false);
    }
  };

  if (step === 'details') {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
        <CoinBackground />
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6">
            <View className="flex-1 justify-center py-10">
              <View className="mb-8">
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-[#4ade80]' : 'text-primary'} mb-2`}>Your Profile</Text>
                <Text className={`font-headline text-4xl font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight leading-tight`}>About You</Text>
                <Text className={`font-body ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mt-3 text-sm leading-relaxed`}>What name should CediSmart use to greet you?</Text>
              </View>

              <GlassSurface radius={28} elevated>
                <View className="p-7">
                  <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3`}>Title</Text>
                  <View className="flex-row mb-6">
                    {(['Mr.', 'Mrs.', 'Ms.', 'None'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setTitle(t)}
                        className={`flex-1 py-3 mx-1 items-center rounded-xl border ${title === t ? 'bg-primary border-primary shadow-sm shadow-primary/20' : `${isDark ? 'bg-black/25' : 'bg-white/60'} ${isDark ? 'border-white/10' : 'border-black/10'}`}`}
                      >
                        <Text className={`font-label text-xs font-bold ${title === t ? 'text-white' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t === 'None' ? 'N/A' : t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View className="mb-8">
                    <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3`}>Full Name</Text>
                    <TextInput
                      className={`${isDark ? 'bg-black/30' : 'bg-white/60'} px-5 py-4 rounded-2xl font-body text-lg ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} border ${isDark ? 'border-white/10' : 'border-black/10'}`}
                      placeholder="e.g. Kofi Mensah"
                      placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                      value={fullName}
                      onChangeText={setFullName}
                      autoFocus
                    />
                  </View>

                  {detailsError ? (
                    <Text className="text-error text-sm font-semibold mb-4 text-center">{detailsError}</Text>
                  ) : null}

                  <TouchableOpacity
                    onPress={handleContinueToPin}
                    disabled={!fullName.trim() || isFinalizingSignUp}
                    className="overflow-hidden rounded-2xl shadow-lg shadow-primary/20"
                  >
                    <View className={`w-full h-14 items-center justify-center flex-row ${!fullName.trim() || isFinalizingSignUp ? (isDark ? 'bg-dark-surface-container-low' : 'bg-gray-300') : 'bg-primary'}`}>
                      <Text className="text-white font-headline font-bold text-base mr-2">{isFinalizingSignUp ? 'Setting up...' : 'Continue'}</Text>
                      {!isFinalizingSignUp && <ArrowRight size={20} color="white" />}
                    </View>
                  </TouchableOpacity>
                </View>
              </GlassSurface>
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
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6">
          <View className="flex-1 justify-center items-center py-10">
            {/* Lock Icon */}
            <GlassSurface
              tint="emerald"
              elevated
              radius={999}
              style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}
            >
              <Lock size={32} color={isDark ? '#4ade80' : '#0d631b'} fill={isDark ? 'rgba(74,222,128,0.25)' : 'rgba(13,99,27,0.18)'} />
            </GlassSurface>

            <Text className={`font-headline font-extrabold text-3xl ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight mb-2`}>Enter Verification Code</Text>
            <Text className={`font-body ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} leading-relaxed text-center mb-8`}>
              6-digit SMS code sent to <Text className={`font-semibold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>{phone}</Text>
            </Text>

            {/* OTP Input Grid */}
            <View className="flex-row justify-between w-full mb-8">
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  className={`w-[14.5%] aspect-square ${isDark ? 'bg-black/35' : 'bg-white/75'} border ${isDark ? 'border-white/20' : 'border-black/15'} rounded-2xl text-center font-headline font-bold text-2xl ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} shadow-sm ${isDark ? 'focus:border-[#4ade80]' : 'focus:border-primary'}`}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={digit}
                  placeholder={digit === '' ? '•' : ''}
                  placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  autoFocus={index === 0}
                  textContentType="oneTimeCode"
                  autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                />
              ))}
            </View>

            {/* Timer & Action */}
            <View className="items-center mb-10">
              <GlassSurface variant="clear" radius={999} style={{ marginBottom: 14 }}>
                <View className="flex-row items-center px-4 py-2">
                  <Clock size={14} color={isDark ? '#4ade80' : '#0d631b'} />
                  <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} ml-2`}>
                    Resend in {formatTime(timer)}
                  </Text>
                </View>
              </GlassSurface>
              
              <TouchableOpacity 
                onPress={() => timer === 0 && resendMutation.mutate()} 
                disabled={timer > 0 || resendMutation.isPending}
              >
                <Text className={`font-label text-sm font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'} ${timer > 0 ? 'opacity-30' : ''}`}>
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
                  verifyOtpMutation.mutate(otp.join(''));
                }
              }}
              disabled={otp.some(d => d === '') || verifyOtpMutation.isPending}
              className="w-full h-14 rounded-2xl overflow-hidden shadow-lg shadow-primary/10"
            >
              <View className={`w-full h-full items-center justify-center flex-row ${
                otp.some(d => d === '') || verifyOtpMutation.isPending 
                  ? (isDark ? 'bg-dark-surface-container-low' : 'bg-gray-300') 
                  : 'bg-primary'
              }`}>
                <Text className={`font-headline font-bold text-base mr-2 ${
                  otp.some(d => d === '') || verifyOtpMutation.isPending 
                    ? (isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant') 
                    : 'text-white'
                }`}>
                  {verifyOtpMutation.isPending ? 'Verifying...' : 'Verify'}
                </Text>
                {!verifyOtpMutation.isPending && (
                  <ArrowRight size={18} color={otp.some(d => d === '') ? (isDark ? '#b2b6b1' : '#40493d') : 'white'} />
                )}
              </View>
            </TouchableOpacity>

            <Text className={`text-center font-body text-[10px] ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} px-8 mt-6`}>
              By verifying, you agree to CediSmart's <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Terms of Service</Text> and <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Privacy Policy</Text>.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Support Action */}
      <View className="absolute bottom-10 right-6">
        <GlassSurface radius={999} elevated>
          <TouchableOpacity 
            onPress={() => setSupportVisible(true)}
            className="flex-row items-center px-4 py-3 active:opacity-80"
          >
            <HelpCircle size={18} color={isDark ? '#4ade80' : '#0d631b'} />
            <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-[#4ade80]' : 'text-primary'} ml-2`}>Support</Text>
          </TouchableOpacity>
        </GlassSurface>
      </View>

      <SupportModal
        visible={supportVisible}
        onClose={() => setSupportVisible(false)}
        phone={phone}
        supportType="auth"
      />
    </SafeAreaView>
  );
};

export default OTPVerifyScreen;
