import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import BottomSheet from '@gorhom/bottom-sheet';
import { ChevronDown, Calendar, ArrowLeft } from 'lucide-react-native';
import { formatGHS, parseCurrencyInput } from '../../utils/currency';
import AccountPicker from '../../components/shared/AccountPicker';
import CategoryPicker from '../../components/shared/CategoryPicker';
import { useOfflineStore } from '../../stores/offlineStore';
import NetInfo from '@react-native-community/netinfo';
import apiClient from '../../api/client';
import uuid from 'react-native-uuid';
import { useQueryClient } from '@tanstack/react-query';

type TransactionForm = {
  amount: string;
  transaction_type: 'income' | 'expense';
  account_id: string;
  category_id: string;
  description: string;
  transaction_date: string;
};

const AddTransactionScreen = ({ navigation }: any) => {
  const accountSheetRef = useRef<BottomSheet>(null);
  const categorySheetRef = useRef<BottomSheet>(null);
  const [accountName, setAccountName] = useState('Select Account');
  const [categoryName, setCategoryName] = useState('Select Category');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { addTransaction } = useOfflineStore();
  const queryClient = useQueryClient();

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<TransactionForm>({
    defaultValues: {
      amount: '',
      transaction_type: 'expense',
      account_id: '',
      category_id: '',
      description: '',
      transaction_date: new Date().toISOString().split('T')[0],
    }
  });

  const transactionType = watch('transaction_type');
  const amountValue = watch('amount');

  const handleAmountChange = (text: string, onChange: (value: string) => void) => {
    // Only allow numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    
    // Prevent multiple decimals
    if ((cleaned.match(/\./g) || []).length > 1) return;
    
    onChange(cleaned);
  };

  const onSubmit = async (data: TransactionForm) => {
    const numericAmount = parseFloat(data.amount);
    
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter an amount greater than 0.');
      return;
    }
    if (!data.account_id) {
      Alert.alert('Missing Info', 'Please select an account.');
      return;
    }
    if (!data.category_id) {
      Alert.alert('Missing Info', 'Please select a category.');
      return;
    }

    setIsSubmitting(true);

    const payload = {
      ...data,
      amount: numericAmount,
      client_id: uuid.v4().toString(),
    };

    try {
      const netState = await NetInfo.fetch();
      
      if (netState.isConnected && netState.isInternetReachable) {
        // Online: send directly to API
        await apiClient.post('/transactions/', payload);
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['budgets'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        
        Alert.alert('Success', 'Transaction saved successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        // Offline: queue it in MMKV
        addTransaction({
          ...payload,
          queued_at: new Date().toISOString(),
        });
        
        Alert.alert('Saved Offline', 'You are offline. Transaction queued and will sync automatically when connection is restored.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Failed to save transaction.';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2">
          <ArrowLeft color="#1C1C2E" size={24} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-charcoal">Add Transaction</Text>
        <View className="w-10" />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1 p-6">
          
          {/* Type Toggle */}
          <View className="flex-row bg-gray-200 rounded-xl p-1 mb-8">
            <TouchableOpacity 
              onPress={() => {
                setValue('transaction_type', 'expense');
                setValue('category_id', '');
                setCategoryName('Select Category');
              }}
              className={`flex-1 py-3 items-center rounded-lg ${transactionType === 'expense' ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`font-bold ${transactionType === 'expense' ? 'text-error' : 'text-gray-500'}`}>Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                setValue('transaction_type', 'income');
                setValue('category_id', '');
                setCategoryName('Select Category');
              }}
              className={`flex-1 py-3 items-center rounded-lg ${transactionType === 'income' ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`font-bold ${transactionType === 'income' ? 'text-success' : 'text-gray-500'}`}>Income</Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View className="items-center mb-8">
            <Text className="text-gray-500 font-medium mb-2">Amount</Text>
            <Text className={`text-4xl font-bold mb-2 ${transactionType === 'income' ? 'text-success' : 'text-charcoal'}`}>
              {amountValue ? formatGHS(amountValue) : 'GHS 0.00'}
            </Text>
            <Controller
              control={control}
              name="amount"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className="w-full text-center text-xl text-charcoal bg-white py-3 rounded-xl border border-gray-200"
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  value={value}
                  onChangeText={(text) => handleAmountChange(text, onChange)}
                  onBlur={onBlur}
                />
              )}
            />
          </View>

          {/* Selectors */}
          <View className="space-y-4 mb-8">
            <TouchableOpacity 
              onPress={() => accountSheetRef.current?.expand()}
              className="flex-row items-center justify-between bg-white p-4 rounded-xl border border-gray-200"
            >
              <View>
                <Text className="text-xs text-gray-500 font-medium mb-1">Account</Text>
                <Text className={`font-semibold ${accountName === 'Select Account' ? 'text-gray-400' : 'text-charcoal'}`}>
                  {accountName}
                </Text>
              </View>
              <ChevronDown color="#9CA3AF" size={20} />
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => categorySheetRef.current?.expand()}
              className="flex-row items-center justify-between bg-white p-4 rounded-xl border border-gray-200"
            >
              <View>
                <Text className="text-xs text-gray-500 font-medium mb-1">Category</Text>
                <Text className={`font-semibold ${categoryName === 'Select Category' ? 'text-gray-400' : 'text-charcoal'}`}>
                  {categoryName}
                </Text>
              </View>
              <ChevronDown color="#9CA3AF" size={20} />
            </TouchableOpacity>

            {/* Note: Simplified date picker for MVP - defaulting to today */}
            <View className="flex-row items-center justify-between bg-white p-4 rounded-xl border border-gray-200 opacity-70">
              <View>
                <Text className="text-xs text-gray-500 font-medium mb-1">Date</Text>
                <Text className="font-semibold text-charcoal">Today</Text>
              </View>
              <Calendar color="#9CA3AF" size={20} />
            </View>
          </View>

          {/* Note */}
          <View className="mb-8">
            <Text className="text-sm font-medium text-gray-700 mb-2 ml-1">Note (Optional)</Text>
            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className="w-full bg-white p-4 rounded-xl border border-gray-200 text-charcoal"
                  placeholder="What was this for?"
                  placeholderTextColor="#9CA3AF"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  multiline
                />
              )}
            />
          </View>

          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className={`w-full py-4 rounded-xl items-center justify-center mb-12 ${isSubmitting ? 'bg-gray-300' : 'bg-primary'}`}
          >
            <Text className="text-white font-bold text-lg">
              {isSubmitting ? 'Saving...' : 'Save Transaction'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <AccountPicker 
        bottomSheetRef={accountSheetRef} 
        onSelect={(id, name) => {
          setValue('account_id', id);
          setAccountName(name);
        }} 
      />
      
      <CategoryPicker 
        bottomSheetRef={categorySheetRef} 
        type={transactionType}
        onSelect={(id, name) => {
          setValue('category_id', id);
          setCategoryName(name);
        }} 
      />
    </SafeAreaView>
  );
};

export default AddTransactionScreen;
