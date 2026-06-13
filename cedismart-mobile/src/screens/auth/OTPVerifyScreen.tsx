import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../../api/client';

const OTPVerifyScreen = ({ route, navigation }: any) => {
  const { phone } = route.params;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(300); // 5 minutes
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

    // Auto-advance
    if (value !== '' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit
    if (index === 5 && value !== '' && newOtp.every(digit => digit !== '')) {
      verifyMutation.mutate({ phone, otp: newOtp.join('') });
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verifyMutation = useMutation({
    mutationFn: (data: { phone: string, otp: string }) => {
      // For now, this just validates OTP. PIN setting happens next.
      // We don't have a verify-only endpoint in the blueprint, 
      // typically we pass OTP to register/verify along with PIN.
      // So here we'll just navigate to SetPIN and pass the OTP along.
      return Promise.resolve(true); 
    },
    onSuccess: () => {
      navigation.navigate('SetPIN', { phone, otp: otp.join('') });
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => apiClient.post('/auth/register/initiate', { phone }),
    onSuccess: () => setTimer(300),
  });

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-background"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6">
        <View className="flex-1 justify-center py-12">
          <Text className="text-3xl font-bold text-charcoal mb-2">Verify Phone</Text>
          <Text className="text-gray-500 mb-8 text-lg">
            We've sent a 6-digit code to {phone}
          </Text>

          <View className="flex-row justify-between mb-8">
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                className="w-[14%] aspect-square border-b-2 border-gray-200 text-center text-2xl font-bold text-charcoal focus:border-primary"
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={(value) => handleOtpChange(value, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                autoFocus={index === 0}
              />
            ))}
          </View>

          {verifyMutation.isError && (
            <View className="bg-red-50 p-4 rounded-xl mb-6">
              <Text className="text-error text-sm text-center">Invalid OTP. Please try again.</Text>
            </View>
          )}

          <View className="items-center">
            {timer > 0 ? (
              <Text className="text-gray-500">Resend code in <Text className="text-charcoal font-medium">{formatTime(timer)}</Text></Text>
            ) : (
              <TouchableOpacity onPress={() => resendMutation.mutate()} disabled={resendMutation.isPending}>
                <Text className="text-primary font-bold">Resend Code</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default OTPVerifyScreen;
