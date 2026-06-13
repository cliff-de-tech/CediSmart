import React from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../../api/client';

const phoneSchema = z.object({
  phone: z.string().regex(/^[0-9]{9}$/, 'Enter a valid 9-digit phone number'),
});

type PhoneForm = z.infer<typeof phoneSchema>;

const RegisterScreen = ({ navigation }: any) => {
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
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-background"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6">
        <View className="flex-1 justify-center py-12">
          <Text className="text-3xl font-bold text-charcoal mb-2">Welcome to CediSmart</Text>
          <Text className="text-gray-500 mb-8 text-lg">Enter your phone number to get started.</Text>

          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 mb-2 ml-1">Phone Number</Text>
            <View className="flex-row items-center border-b-2 border-gray-200 py-2 focus:border-primary">
              <Text className="text-xl text-charcoal mr-2 font-medium">+233</Text>
              <Controller
                control={control}
                name="phone"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="flex-1 text-xl text-charcoal font-medium"
                    placeholder="24XXXXXXX"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                    maxLength={9}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    autoFocus
                  />
                )}
              />
            </View>
            {errors.phone && (
              <Text className="text-error text-xs mt-2 ml-1">{errors.phone.message}</Text>
            )}
          </View>

          {mutation.isError && (
            <View className="bg-red-50 p-4 rounded-xl mb-6">
              <Text className="text-error text-sm text-center">
                {(mutation.error as any)?.response?.data?.error?.message || 'Something went wrong. Please try again.'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={mutation.isPending}
            className={`w-full py-4 rounded-xl items-center justify-center ${mutation.isPending ? 'bg-gray-300' : 'bg-primary shadow-lg shadow-primary/20'}`}
          >
            <Text className="text-white font-bold text-lg">
              {mutation.isPending ? 'Sending OTP...' : 'Continue'}
            </Text>
          </TouchableOpacity>

          <View className="mt-8 flex-row justify-center">
            <Text className="text-gray-500">Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text className="text-primary font-bold">Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default RegisterScreen;
