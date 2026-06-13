import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Shield, ArrowRight, Lock, Clock, HelpCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/client';

const OTPVerifyScreen = ({ route, navigation }: any) => {
  const { phone } = route.params;
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
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value !== '' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === 5 && value !== '' && newOtp.every(digit => digit !== '')) {
      setTimeout(() => setStep('details'), 400);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const resendMutation = useMutation({
    mutationFn: () => apiClient.post('/auth/register/initiate', { phone }),
    onSuccess: () => setTimer(300),
  });

  if (step === 'details') {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-8">
            {/* Decoration Layer */}
            <View className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />
            
            <View className="flex-1 justify-center py-12">
              <View className="mb-10">
                <Text className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary mb-3">Sovereign Identity</Text>
                <Text className="font-headline text-4xl font-bold text-on-surface tracking-tight leading-tight">About You</Text>
                <Text className="font-body text-on-surface-variant mt-4 text-sm leading-relaxed">Help us personalize your ledger experience.</Text>
              </View>

              <View className="bg-surface-container-lowest rounded-3xl p-8 shadow-sm">
                <Text className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Title</Text>
                <View className="flex-row space-x-2 mb-8">
                  {(['Mr.', 'Mrs.', 'Ms.', 'None'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setTitle(t)}
                      className={`flex-1 py-3 items-center rounded-xl border ${title === t ? 'bg-primary border-primary shadow-sm shadow-primary/20' : 'bg-surface-container-low border-outline-variant/10'}`}
                    >
                      <Text className={`font-label text-xs font-bold ${title === t ? 'text-white' : 'text-gray-400'}`}>{t === 'None' ? 'N/A' : t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View className="mb-10">
                  <Text className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Full Name</Text>
                  <TextInput
                    className="bg-surface-container-low px-5 py-4 rounded-2xl font-body text-lg text-on-surface"
                    placeholder="e.g. Kofi Mensah"
                    placeholderTextColor="#D1D5DB"
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
                  <View className={`w-full h-14 items-center justify-center flex-row space-x-3 ${!fullName.trim() ? 'bg-gray-300' : 'bg-primary'}`}>
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
    <SafeAreaView className="flex-1 bg-surface">
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
            <View className="w-20 h-20 rounded-full bg-surface-container-low items-center justify-center mb-8 shadow-sm">
              <Lock size={32} color="#0d631b" fill="#0d631b" opacity={0.8} />
            </View>

            <Text className="font-headline font-extrabold text-3xl text-on-surface tracking-tight mb-2">Security Check</Text>
            <Text className="font-body text-on-surface-variant leading-relaxed text-center mb-10">
              OTP sent to <Text className="font-semibold text-on-surface">{phone}</Text>
            </Text>

            {/* OTP Input Grid */}
            <View className="flex-row justify-between w-full mb-10">
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  className="w-[14%] aspect-square bg-surface-container-lowest border border-outline-variant/20 rounded-xl text-center font-headline font-bold text-2xl text-on-surface shadow-sm focus:border-primary"
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  placeholder={digit === '' ? '•' : ''}
                  placeholderTextColor="#D1D5DB"
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  autoFocus={index === 0}
                />
              ))}
            </View>

            {/* Timer & Action */}
            <View className="items-center space-y-4 mb-12">
              <View className="flex-row items-center space-x-2 px-4 py-2 rounded-full bg-surface-container-low border border-outline-variant/10">
                <Clock size={14} color="#4c56af" />
                <Text className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Resend in {formatTime(timer)}
                </Text>
              </View>
              
              <TouchableOpacity 
                onPress={() => timer === 0 && resendMutation.mutate()} 
                disabled={timer > 0 || resendMutation.isPending}
              >
                <Text className={`font-label text-sm font-bold ${timer > 0 ? 'text-secondary opacity-30' : 'text-secondary'}`}>
                  Resend Code
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              disabled={otp.some(d => d === '')}
              className="w-full h-14 rounded-2xl overflow-hidden shadow-lg shadow-primary/10"
            >
              <View className={`w-full h-full items-center justify-center flex-row space-x-2 ${otp.some(d => d === '') ? 'bg-surface-container-highest' : 'bg-primary'}`}>
                <Text className={`font-headline font-bold text-base ${otp.some(d => d === '') ? 'text-on-surface-variant' : 'text-white'}`}>Verify</Text>
                <ArrowRight size={18} color={otp.some(d => d === '') ? '#40493d' : 'white'} />
              </View>
            </TouchableOpacity>

            <Text className="text-center font-body text-[10px] text-on-surface-variant px-8 mt-6">
              By verifying, you agree to CediSmart's <Text className="text-primary font-bold">Terms of Service</Text> and <Text className="text-primary font-bold">Privacy Policy</Text>.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Support Action */}
      <View className="absolute bottom-10 right-8">
        <TouchableOpacity className="flex-row items-center space-x-2 bg-surface-container-lowest/80 px-4 py-3 rounded-full shadow-lg border border-outline-variant/10">
          <HelpCircle size={20} color="#0d631b" />
          <Text className="font-label text-[10px] font-bold uppercase tracking-widest text-primary">Support</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default OTPVerifyScreen;
