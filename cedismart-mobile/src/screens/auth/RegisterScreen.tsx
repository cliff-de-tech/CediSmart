import React from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Shield } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignUp } from '@clerk/clerk-expo';
import apiClient from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { GlassSurface } from '../../components/glass/GlassSurface';

const normalizeGhanaPhoneDigits = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('233') && digits.length >= 12) {
    return digits.slice(3, 12);
  }
  if (digits.startsWith('0')) {
    return digits.slice(1, 10);
  }
  return digits.slice(0, 9);
};

const phoneSchema = z.object({
  phone: z
    .string()
    .transform((val) => normalizeGhanaPhoneDigits(val))
    .refine((val) => /^[0-9]{9}$/.test(val), 'Enter a valid Ghana mobile number (e.g. 0241234567 or 241234567)'),
});

type PhoneForm = z.infer<typeof phoneSchema>;

const RegisterScreen = ({ navigation }: any) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const { isLoaded, signUp } = useSignUp();

  const { control, handleSubmit, formState: { errors } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });

  const mutation = useMutation({
    mutationFn: async (data: { phone: string }) => {
      if (!isLoaded) {
        throw new Error('Verification service not loaded yet. Please try again.');
      }
      
      const clean9 = normalizeGhanaPhoneDigits(data.phone);
      const formattedPhone = `+233${clean9}`;
      console.log('[Register Clerk] Starting signUp for:', formattedPhone);
      
      // Start registration flow with Clerk
      await signUp.create({
        phoneNumber: formattedPhone,
      });
      
      // Send OTP via SMS
      await signUp.preparePhoneNumberVerification({
        strategy: 'phone_code',
      });
      
      return formattedPhone;
    },
    onSuccess: (formattedPhone) => {
      console.log('[Register Clerk] Verification initiated');
      navigation.navigate('OTPVerify', { phone: formattedPhone, flow: 'register' });
    },
    onError: (err: any) => {
      console.error('[Register Clerk] Error:', err);
    },
  });

  const onSubmit = (data: PhoneForm) => {
    mutation.mutate(data);
  };

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
      <CoinBackground />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6">
          {/* Top Branding Section */}
          <View className="pt-10 mb-8">
            <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-[#4ade80]' : 'text-primary'} mb-3`}>Get Started in Seconds</Text>
            <Text className={`font-headline text-4xl font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight leading-tight`}>Create Account</Text>
            <Text className={`font-body ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mt-3 text-sm leading-relaxed max-w-[300px]`}>
              Record your daily spending, track Mobile Money & cash, and see where your money goes each month.
            </Text>
          </View>

          {/* Registration Form */}
          <GlassSurface radius={28} elevated style={{ width: '100%' }}>
            <View className="p-7 space-y-6">
              {/* Phone Number Input Group */}
              <View className="space-y-3">
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-2`}>Mobile Phone Number</Text>
                <View className={`flex-row items-center ${isDark ? 'bg-black/30' : 'bg-white/60'} rounded-2xl overflow-hidden h-14 border ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                  {/* Prefix Container */}
                  <View className={`flex-row items-center px-4 ${isDark ? 'bg-white/5' : 'bg-black/5'} h-full border-r ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                    <Image 
                      source={{ uri: 'https://flagsapi.com/GH/flat/64.png' }} 
                      className="w-6 h-4 rounded-sm mr-2"
                    />
                    <Text className={`font-body font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>+233</Text>
                  </View>
                  {/* Input Field */}
                  <Controller
                    control={control}
                    name="phone"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        className={`flex-1 h-full px-4 font-body text-lg tracking-widest ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}
                        placeholder="024XXXXXXX"
                        placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                        keyboardType="phone-pad"
                        maxLength={10}
                        onBlur={onBlur}
                        onChangeText={(txt) => {
                          const digits = txt.replace(/\D/g, '');
                          // If user types 10 digits starting with 0, normalize to 9 digits automatically
                          if (digits.startsWith('0') && digits.length === 10) {
                            onChange(digits.slice(1));
                          } else {
                            onChange(digits);
                          }
                        }}
                        value={value}
                      />
                    )}
                  />
                </View>
                <Text className={`font-body text-[10px] ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} leading-relaxed mt-2`}>
                  Enter your Ghana mobile number (with or without the leading 0). We'll send a 6-digit verification code via SMS.
                </Text>
                {errors.phone && (
                  <Text className="text-error text-[10px] font-bold mt-1">{errors.phone.message}</Text>
                )}
              </View>

              {mutation.error ? (
                <Text className="text-error text-xs font-semibold text-center my-2">
                  {(mutation.error as any)?.errors?.[0]?.message || 
                   (mutation.error as any)?.message || 
                   'Failed to send verification code. Please try again.'}
                </Text>
              ) : null}

              {/* Primary CTA Button */}
              <TouchableOpacity
                onPress={() => handleSubmit(onSubmit)()}
                disabled={mutation.isPending}
                className="overflow-hidden rounded-2xl shadow-lg shadow-primary/20 mt-4"
              >
                <View className={`w-full h-14 items-center justify-center flex-row space-x-3 ${mutation.isPending ? (isDark ? 'bg-dark-surface-container-low' : 'bg-gray-300') : 'bg-primary'}`}>
                  <Text className="text-white font-headline font-bold text-base mr-2">
                    {mutation.isPending ? 'Sending Code...' : 'Send Verification Code'}
                  </Text>
                  <ArrowRight size={20} color="white" />
                </View>
              </TouchableOpacity>

              {/* Terms & Privacy */}
              <Text className={`text-center font-body text-[10px] ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} leading-relaxed px-4 mt-4`}>
                By continuing, you agree to our{' '}
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold underline`}>Terms of Service</Text>{' '}
                and{' '}
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold underline`}>Privacy Policy</Text>.
              </Text>
            </View>
          </GlassSurface>

          {/* Footer Actions */}
          <View className="mt-10 items-center space-y-6 pb-12">
            <View className="flex-row">
              <Text className={`font-body text-sm ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Log In</Text>
              </TouchableOpacity>
            </View>

            <View className="flex flex-col items-center space-y-4 pt-8">
              <View className="flex-row items-center opacity-40 space-x-2">
                <Shield size={12} color={isDark ? '#e1e3e0' : '#1c1b1f'} fill={isDark ? '#e1e3e0' : '#1c1b1f'} />
                <Text className={`font-label text-[9px] uppercase tracking-widest font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} ml-1.5`}>End-to-End Encrypted</Text>
              </View>
              {/* Ghanaian Heritage Accent */}
              <View className="flex-row space-x-1 opacity-20 mt-2">
                <View className="w-1.5 h-1.5 rounded-full bg-tertiary mx-0.5" />
                <View className="w-1.5 h-1.5 rounded-full bg-primary mx-0.5" />
                <View className="w-1.5 h-1.5 rounded-full bg-secondary mx-0.5" />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default RegisterScreen;
