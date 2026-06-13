import React, { useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, FlatList, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Landmark, Wallet, Smartphone, Plus } from 'lucide-react-native';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';

interface Account {
  id: string;
  name: string;
  account_type: 'bank' | 'mobile_money' | 'cash';
  provider: string | null;
  balance: string;
  is_active: boolean;
}

const AccountsScreen = () => {
  const queryClient = useQueryClient();
  const bottomSheetRef = useRef<BottomSheet>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'bank' | 'mobile_money' | 'cash'>('cash');
  const [provider, setProvider] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await apiClient.get('/accounts/');
      return response.data;
    }
  });

  const totalBalance = useMemo(() => {
    if (!accounts) return 0;
    return accounts.reduce((acc, curr) => acc + parseFloat(curr.balance), 0);
  }, [accounts]);

  const createMutation = useMutation({
    mutationFn: (newAccount: any) => apiClient.post('/accounts/', newAccount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      Alert.alert('Success', 'Account created successfully!');
      bottomSheetRef.current?.close();
      // Reset form
      setName('');
      setType('cash');
      setProvider('');
      setOpeningBalance('0');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to create account');
    }
  });

  const handleCreate = () => {
    if (!name) {
      Alert.alert('Missing Info', 'Please enter an account name.');
      return;
    }
    createMutation.mutate({
      name,
      account_type: type,
      provider: type === 'cash' ? null : provider,
      opening_balance: parseFloat(openingBalance) || 0
    });
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank': return <Landmark size={24} color="#0A6E4A" />;
      case 'mobile_money': return <Smartphone size={24} color="#0A6E4A" />;
      default: return <Wallet size={24} color="#0A6E4A" />;
    }
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 py-8">
        <Text className="text-3xl font-bold text-charcoal mb-2">My Accounts</Text>
        <Text className="text-gray-500 mb-8">Manage your money sources</Text>

        {/* Total Summary */}
        <View className="bg-charcoal p-6 rounded-3xl mb-8">
          <Text className="text-white/60 mb-1">Total Balance</Text>
          <Text className="text-white text-3xl font-bold">{formatGHS(totalBalance)}</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-8" />
        ) : (
          <FlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View className="flex-row items-center bg-white p-4 rounded-2xl mb-4 border border-gray-100 shadow-sm">
                <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center mr-4">
                  {getAccountIcon(item.account_type)}
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-charcoal text-lg">{item.name}</Text>
                  <Text className="text-gray-500 capitalize">{item.provider || item.account_type}</Text>
                </View>
                <Text className={`font-bold text-lg ${parseFloat(item.balance) < 0 ? 'text-error' : 'text-charcoal'}`}>
                  {formatGHS(item.balance)}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center justify-center py-12">
                <Text className="text-gray-400 text-center mb-6">No accounts yet. Add your first one to start tracking!</Text>
              </View>
            }
          />
        )}

        {/* Add Account FAB */}
        <TouchableOpacity 
          onPress={() => bottomSheetRef.current?.expand()}
          className="absolute bottom-6 right-6 w-16 h-16 bg-primary rounded-full items-center justify-center shadow-lg shadow-primary/40"
        >
          <Plus color="white" size={32} />
        </TouchableOpacity>
      </View>

      {/* Add Account Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['90%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-5 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-charcoal">New Account</Text>
              <TouchableOpacity onPress={() => bottomSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Type Selector - Compact Grid */}
            <Text className="text-[10px] uppercase font-bold text-gray-400 mb-3 tracking-widest ml-1">Account Type</Text>
            <View className="flex-row justify-between mb-8">
              {[
                { id: 'cash', label: 'Cash', icon: <Wallet size={18} color={type === 'cash' ? '#FFF' : '#9CA3AF'} /> },
                { id: 'mobile_money', label: 'MoMo', icon: <Smartphone size={18} color={type === 'mobile_money' ? '#FFF' : '#9CA3AF'} /> },
                { id: 'bank', label: 'Bank', icon: <Landmark size={18} color={type === 'bank' ? '#FFF' : '#9CA3AF'} /> },
              ].map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setType(t.id as any)}
                  className={`w-[31%] items-center py-3 rounded-xl border ${
                    type === t.id 
                      ? 'bg-primary border-primary shadow-sm shadow-primary/20' 
                      : 'bg-white border-gray-100'
                  }`}
                >
                  <View className="mb-1">{t.icon}</View>
                  <Text className={`text-[10px] font-bold ${type === t.id ? 'text-white' : 'text-gray-400'}`}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Form Fields */}
            <View className="space-y-5">
              <View>
                <Text className="text-xs font-semibold text-charcoal mb-2 ml-1">Name</Text>
                <TextInput
                  className="bg-white px-4 py-4 rounded-xl border border-gray-100 text-charcoal text-base shadow-sm"
                  placeholder="e.g. Daily Spending"
                  placeholderTextColor="#D1D5DB"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              {type !== 'cash' && (
                <View>
                  <Text className="text-xs font-semibold text-charcoal mb-2 ml-1">Provider</Text>
                  <TextInput
                    className="bg-white px-4 py-4 rounded-xl border border-gray-100 text-charcoal text-base shadow-sm"
                    placeholder={type === 'bank' ? 'e.g. GCB or Ecobank' : 'e.g. MTN or Telecel'}
                    placeholderTextColor="#D1D5DB"
                    value={provider}
                    onChangeText={setProvider}
                  />
                </View>
              )}

              <View>
                <Text className="text-xs font-semibold text-charcoal mb-2 ml-1">Opening Balance (GHS)</Text>
                <View className="flex-row items-center bg-white px-4 py-4 rounded-xl border border-gray-100 shadow-sm">
                  <Text className="text-lg font-bold text-primary mr-2">₵</Text>
                  <TextInput
                    className="flex-1 text-lg font-bold text-charcoal"
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={openingBalance}
                    onChangeText={setOpeningBalance}
                  />
                </View>
              </View>
            </View>

            <View className="mt-10">
              <TouchableOpacity
                onPress={handleCreate}
                disabled={createMutation.isPending}
                className={`w-full py-4 rounded-xl items-center justify-center shadow-lg ${
                  createMutation.isPending ? 'bg-gray-300' : 'bg-primary shadow-primary/30'
                }`}
              >
                <Text className="text-white font-bold text-base">
                  {createMutation.isPending ? 'Working...' : 'Create Account'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
};

export default AccountsScreen;
