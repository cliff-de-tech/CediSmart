import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import BottomSheet from '@gorhom/bottom-sheet';
import { ChevronRight, Calendar, ArrowLeft, Utensils, Landmark, Smartphone, Wallet, Tag, Receipt, CheckCircle, Smartphone as MoMoIcon } from 'lucide-react-native';
import { formatGHS } from '../../utils/currency';
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
  const [categoryColor, setCategoryColor] = useState('#707a6c');
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
    const cleaned = text.replace(/[^0-9.]/g, '');
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
        await apiClient.post('/transactions/', payload);
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['budgets'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        
        Alert.alert('Success', 'Transaction saved successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        addTransaction({
          ...payload,
          queued_at: new Date().toISOString(),
        });
        
        Alert.alert('Saved Offline', 'Transaction queued for sync.', [
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
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 bg-surface sticky top-0 z-50">
        <View className="flex-row items-center space-x-4">
          <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 rounded-full bg-surface-container-low active:scale-95 transition-all">
            <ArrowLeft size={24} color="#0d631b" />
          </TouchableOpacity>
          <Text className="text-xl font-headline font-bold text-on-surface tracking-tight">Add Transaction</Text>
        </View>
        <View className="bg-surface-container-high px-3 py-1 rounded-full">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-outline">GHS WALLET</Text>
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="px-6 pt-8 pb-32">
            
            {/* Amount Section */}
            <View className="mb-12 items-center">
              <Text className="font-label uppercase tracking-widest text-[10px] text-outline mb-4">Enter Amount</Text>
              <View className="flex-row items-baseline space-x-3">
                <Text className="font-headline font-bold text-2xl text-primary">GHS</Text>
                <Controller
                  control={control}
                  name="amount"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="min-w-[200px] text-center font-headline font-extrabold text-6xl tracking-tighter text-on-surface"
                      placeholder="0.00"
                      placeholderTextColor="#D1D5DB"
                      keyboardType="decimal-pad"
                      value={value}
                      onChangeText={(text) => handleAmountChange(text, onChange)}
                      onBlur={onBlur}
                      autoFocus
                    />
                  )}
                />
              </View>
              <View className="h-1 w-12 bg-primary/20 mt-4 rounded-full" />
            </View>

            {/* Type Toggle */}
            <View className="mb-10 w-full max-w-[280px] self-center">
              <View className="flex-row bg-surface-container-low p-1.5 rounded-full shadow-sm border border-outline-variant/10">
                <TouchableOpacity 
                  onPress={() => {
                    setValue('transaction_type', 'expense');
                    setValue('category_id', '');
                    setCategoryName('Select Category');
                  }}
                  className={`flex-1 py-3 items-center rounded-full transition-all ${transactionType === 'expense' ? 'bg-primary shadow-lg' : ''}`}
                >
                  <Text className={`font-headline font-bold text-sm ${transactionType === 'expense' ? 'text-white' : 'text-on-surface-variant'}`}>Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    setValue('transaction_type', 'income');
                    setValue('category_id', '');
                    setCategoryName('Select Category');
                  }}
                  className={`flex-1 py-3 items-center rounded-full transition-all ${transactionType === 'income' ? 'bg-primary shadow-lg' : ''}`}
                >
                  <Text className={`font-headline font-bold text-sm ${transactionType === 'income' ? 'text-white' : 'text-on-surface-variant'}`}>Income</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Bento Grid */}
            <View className="space-y-4">
              <View className="flex-row space-x-4">
                {/* Category Picker */}
                <TouchableOpacity 
                  onPress={() => categorySheetRef.current?.expand()}
                  className="flex-1 bg-surface-container-lowest p-6 rounded-[24px] shadow-sm border border-outline-variant/5 active:bg-surface-container-low"
                >
                  <View 
                    className="w-12 h-12 rounded-2xl items-center justify-center mb-4"
                    style={{ backgroundColor: categoryName === 'Select Category' ? '#ebe7ec' : `${categoryColor}20` }}
                  >
                    <Tag size={24} color={categoryName === 'Select Category' ? '#707a6c' : categoryColor} fill={categoryName === 'Select Category' ? 'none' : categoryColor} />
                  </View>
                  <Text className="font-label uppercase tracking-widest text-[10px] text-outline mb-1">Category</Text>
                  <Text className={`font-headline font-bold text-lg ${categoryName === 'Select Category' ? 'text-outline/50' : 'text-on-surface'}`} numberOfLines={1}>
                    {categoryName}
                  </Text>
                </TouchableOpacity>

                {/* Account Picker */}
                <TouchableOpacity 
                  onPress={() => accountSheetRef.current?.expand()}
                  className="flex-1 bg-surface-container-lowest p-6 rounded-[24px] shadow-sm border border-outline-variant/5 active:bg-surface-container-low"
                >
                  <View className="w-12 h-12 rounded-2xl bg-secondary/10 items-center justify-center mb-4">
                    <Wallet size={24} color="#4c56af" />
                  </View>
                  <Text className="font-label uppercase tracking-widest text-[10px] text-outline mb-1">Account</Text>
                  <Text className={`font-headline font-bold text-lg ${accountName === 'Select Account' ? 'text-outline/50' : 'text-on-surface'}`} numberOfLines={1}>
                    {accountName}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Date Selector */}
              <TouchableOpacity className="bg-surface-container-lowest p-6 rounded-[24px] shadow-sm border border-outline-variant/5 active:bg-surface-container-low">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center space-x-4">
                    <View className="w-12 h-12 rounded-2xl bg-surface-container-high items-center justify-center">
                      <Calendar size={24} color="#40493d" />
                    </View>
                    <View>
                      <Text className="font-label uppercase tracking-widest text-[10px] text-outline mb-1">Date</Text>
                      <Text className="font-headline font-bold text-lg text-on-surface">Today, {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
                    </View>
                  </View>
                  <ChevronRight size={20} color="#707a6c" />
                </View>
              </TouchableOpacity>

              {/* Description */}
              <View className="bg-surface-container-low rounded-[24px] p-6 focus-within:bg-surface-container-highest transition-all shadow-sm">
                <Text className="font-label uppercase tracking-widest text-[10px] text-outline mb-2">Description (Optional)</Text>
                <Controller
                  control={control}
                  name="description"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="w-full font-body text-on-surface text-base"
                      placeholder="What was this for?"
                      placeholderTextColor="#707a6c50"
                      multiline
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                  )}
                />
              </View>
            </View>

            {/* Tags/Receipts Horizontal */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-8 overflow-visible">
              <TouchableOpacity className="mr-3 px-6 py-3 rounded-full bg-surface-container-high flex-row items-center space-x-2 border border-outline-variant/5 shadow-sm">
                <Tag size={16} color="#40493d" />
                <Text className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">Add Tag</Text>
              </TouchableOpacity>
              <TouchableOpacity className="px-6 py-3 rounded-full bg-surface-container-high flex-row items-center space-x-2 border border-outline-variant/5 shadow-sm">
                <Receipt size={16} color="#40493d" />
                <Text className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">Attach Receipt</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Save Button */}
      <View className="absolute bottom-10 left-0 right-0 px-10">
        <TouchableOpacity
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          className={`w-full flex-row items-center justify-center space-x-3 py-5 rounded-[24px] shadow-2xl shadow-primary/30 ${isSubmitting ? 'bg-gray-300' : 'bg-primary'}`}
        >
          <Text className="text-white font-headline font-bold text-lg">Save Transaction</Text>
          <CheckCircle size={20} color="white" />
        </TouchableOpacity>
      </View>

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
          // For demo, we'll just use primary green if no color
          setCategoryColor('#0d631b');
        }} 
      />
    </SafeAreaView>
  );
};

export default AddTransactionScreen;
