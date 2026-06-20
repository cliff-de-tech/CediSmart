import React from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Shield } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import { CoinBackground } from '../../components/shared/CoinBackground';

const phoneSchema = z.object({
  phone: z.string().regex(/^[0-9]{9}$/, 'Enter a valid 9-digit phone number'),
});

type PhoneForm = z.infer<typeof phoneSchema>;

const RegisterScreen = ({ navigation }: any) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  const { control, handleSubmit, formState: { errors } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: { phone: string }) => {
      return apiClient.post('/auth/register/initiate', {
        phone: `+233${data.phone}`,
      });
    },
    onSuccess: (response, variables) => {
      navigation.navigate('OTPVerify', { phone: `+233${variables.phone}` });
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
          <View className="pt-12 mb-12">
            <Text className="font-label text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Join Sovereign Ledger</Text>
            <Text className={`font-headline text-4xl font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight leading-tight`}>Create Account</Text>
            <Text className={`font-body ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mt-4 text-sm leading-relaxed max-w-[280px]`}>
              Secure your financial future with Ghana's most trusted digital ledger system.
            </Text>
          </View>

          {/* Registration Form */}
          <View className={`w-full ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-lowest'} rounded-3xl p-8 shadow-sm`}>
            <View className="space-y-8">
              {/* Phone Number Input Group */}
              <View className="space-y-3">
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Phone Number</Text>
                <View className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} rounded-2xl overflow-hidden h-14 border ${isDark ? 'border-dark-outline-variant/20' : 'border-transparent'}`}>
                  {/* Prefix Container */}
                  <View className={`flex-row items-center px-4 ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-high'} h-full border-r ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}>
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
                        placeholder="XXXXXXXXX"
                        placeholderTextColor={isDark ? '#434942' : '#D1D5DB'}
                        keyboardType="phone-pad"
                        maxLength={9}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                </View>
                <Text className={`font-body text-[10px] ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} leading-relaxed`}>
                  Enter your 9-digit mobile number registered with GHS services.
                </Text>
                {errors.phone && (
                  <Text className="text-error text-[10px] font-bold mt-1">{errors.phone.message}</Text>
                )}
              </View>

              {mutation.error ? (
                <Text className="text-error text-xs font-semibold text-center mb-4">
                  {(mutation.error as any)?.response?.data?.error?.message || 'Failed to send OTP. Please try again.'}
                </Text>
              ) : null}

              {/* Primary CTA Button */}
              <TouchableOpacity
                onPress={handleSubmit(onSubmit)}
                disabled={mutation.isPending}
                className="overflow-hidden rounded-2xl shadow-lg shadow-primary/20"
              >
                <View className={`w-full h-14 items-center justify-center flex-row space-x-3 ${mutation.isPending ? (isDark ? 'bg-dark-surface-container-low' : 'bg-gray-300') : 'bg-primary'}`}>
                  <Text className="text-white font-headline font-bold text-base">
                    {mutation.isPending ? 'Sending...' : 'Send OTP'}
                  </Text>
                  <ArrowRight size={20} color="white" />
                </View>
              </TouchableOpacity>

              {/* Terms & Privacy */}
              <Text className={`text-center font-body text-[10px] ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} leading-relaxed px-4`}>
                By continuing, you agree to our{' '}
                <Text className={`${isDark ? 'text-[#2e7d32]' : 'text-primary'} font-bold underline`}>Terms of Service</Text>{' '}
                and{' '}
                <Text className={`${isDark ? 'text-[#2e7d32]' : 'text-primary'} font-bold underline`}>Privacy Policy</Text>.
              </Text>
            </View>
          </View>

          {/* Footer Actions */}
          <View className="mt-10 items-center space-y-6 pb-12">
            <View className="flex-row">
              <Text className={`font-body text-sm ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text className="text-primary font-bold">Log In</Text>
              </TouchableOpacity>
            </View>

            <View className="flex flex-col items-center space-y-4 pt-8">
              <View className="flex-row items-center opacity-40 space-x-2">
                <Shield size={12} color={isDark ? '#e1e3e0' : '#1c1b1f'} fill={isDark ? '#e1e3e0' : '#1c1b1f'} />
                <Text className={`font-label text-[9px] uppercase tracking-widest font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>End-to-End Encrypted</Text>
              </View>
              {/* Ghanaian Heritage Accent */}
              <View className="flex-row space-x-1 opacity-20">
                <View className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                <View className="w-1.5 h-1.5 rounded-full bg-primary" />
                <View className="w-1.5 h-1.5 rounded-full bg-secondary" />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default RegisterScreen;
