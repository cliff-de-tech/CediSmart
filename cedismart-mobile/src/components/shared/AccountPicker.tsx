import React, { useMemo, useCallback, useState } from 'react';
import { GlassSheetBackground } from '../glass/GlassSheetBackground';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import BottomSheet from './AppBottomSheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useThemeStore } from '../../stores/themeStore';
import apiClient from '../../api/client';
import { Landmark, Wallet, Smartphone, Plus, Check } from 'lucide-react-native';
import { formatGHS } from '../../utils/currency';
import * as Haptics from 'expo-haptics';

interface Account {
  id: string;
  name: string;
  provider: string;
  account_type: string;
  balance: string;
}

interface AccountPickerProps {
  bottomSheetRef: React.RefObject<BottomSheet | null>;
  onSelect: (accountId: string, accountName: string) => void;
}

const AccountPicker: React.FC<AccountPickerProps> = ({ bottomSheetRef, onSelect }) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();
  const snapPoints = useMemo(() => ['60%', '92%'], []);

  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickType, setQuickType] = useState<'cash' | 'mobile_money' | 'bank'>('cash');
  const [quickName, setQuickName] = useState('Physical Cash');
  const [quickProvider, setQuickProvider] = useState('MTN MoMo');
  const [quickBalance, setQuickBalance] = useState('');

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await apiClient.get('/accounts/');
      return response.data;
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      account_type: 'cash' | 'mobile_money' | 'bank';
      provider?: string;
      opening_balance: number;
    }) => {
      const res = await apiClient.post('/accounts/', payload);
      return res.data as Account;
    },
    onSuccess: (newAccount) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowQuickCreate(false);
      setQuickBalance('');
      onSelect(newAccount.id, newAccount.name);
      bottomSheetRef.current?.close();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        'Could not create account right now. Please try again.';
      Alert.alert('Account Creation Failed', msg);
    },
  });

  const handleQuickCreateSubmit = () => {
    const parsedBal = quickBalance.trim() === '' ? 0 : parseFloat(quickBalance);
    if (isNaN(parsedBal) || parsedBal < 0) {
      Alert.alert('Invalid Balance', 'Starting balance must be 0 or a positive number.');
      return;
    }
    const resolvedName =
      quickType === 'cash'
        ? 'Physical Cash'
        : quickName.trim() || (quickType === 'mobile_money' ? `${quickProvider} Wallet` : 'Bank Account');

    createAccountMutation.mutate({
      name: resolvedName,
      account_type: quickType,
      provider: quickType === 'cash' ? 'Physical Cash' : quickProvider,
      opening_balance: parsedBal,
    });
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  const handleSelect = (id: string, name: string) => {
    onSelect(id, name);
    bottomSheetRef.current?.close();
  };

  const getAccountIcon = (type: string) => {
    if (type === 'cash') return Wallet;
    if (type === 'mobile_money') return Smartphone;
    return Landmark;
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundComponent={GlassSheetBackground}
      handleIndicatorStyle={{ backgroundColor: theme === 'dark' ? '#374151' : '#D1D5DB', width: 40 }}
    >
      <View className="px-6 pb-4 flex-1">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className={`text-xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
              Paid with
            </Text>
            <Text className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Choose which cash, MoMo, or bank account to use
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setShowQuickCreate(!showQuickCreate);
            }}
            className={`px-3.5 py-2 rounded-full flex-row items-center ${
              isDark ? 'bg-primary/25 border border-primary/40' : 'bg-primary/10'
            }`}
          >
            <Plus size={14} color={isDark ? '#4ade80' : '#0A6E4A'} />
            <Text className={`font-bold text-xs ml-1 ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>
              {showQuickCreate ? 'Cancel' : 'New Account'}
            </Text>
          </TouchableOpacity>
        </View>

        {showQuickCreate && (
          <View
            style={{
              padding: 16,
              marginBottom: 16,
              borderRadius: 22,
              borderWidth: 1,
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.03)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)',
              overflow: 'hidden',
            }}
          >
            <Text className={`font-bold text-sm mb-3 ${isDark ? 'text-white' : 'text-charcoal'}`}>
              Add Tracked Account (Preserves Draft)
            </Text>

            <View className="flex-row mb-3" style={{ gap: 8 }}>
              {[
                { key: 'cash' as const, label: '💵 Cash', defaultName: 'Physical Cash', defaultProvider: 'Physical Cash' },
                { key: 'mobile_money' as const, label: '📱 MoMo', defaultName: 'MTN MoMo Wallet', defaultProvider: 'MTN MoMo' },
                { key: 'bank' as const, label: '🏦 Bank', defaultName: 'Bank Account', defaultProvider: 'GCB Bank' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => {
                    setQuickType(opt.key);
                    setQuickName(opt.defaultName);
                    setQuickProvider(opt.defaultProvider);
                  }}
                  className={`flex-1 py-2.5 rounded-xl items-center border ${
                    quickType === opt.key
                      ? 'bg-primary border-primary'
                      : isDark
                      ? 'bg-black/25 border-white/10'
                      : 'bg-white/60 border-black/10'
                  }`}
                >
                  <Text
                    className={`font-bold text-xs ${
                      quickType === opt.key ? 'text-white' : isDark ? 'text-gray-300' : 'text-charcoal'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {quickType !== 'cash' && (
              <TextInput
                value={quickName}
                onChangeText={setQuickName}
                placeholder="Account name (e.g. MTN MoMo, Ecobank)"
                placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                className={`w-full px-3.5 py-2.5 rounded-xl mb-2.5 text-sm border ${
                  isDark
                    ? 'bg-black/30 text-white border-white/10'
                    : 'bg-white/70 text-charcoal border-black/10'
                }`}
              />
            )}

            <TextInput
              value={quickBalance}
              onChangeText={(t) => setQuickBalance(t.replace(/[^0-9.]/g, ''))}
              placeholder="Starting balance in GH₵ (optional, defaults to 0.00)"
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
              keyboardType="decimal-pad"
              className={`w-full px-3.5 py-2.5 rounded-xl mb-3 text-sm border ${
                isDark
                  ? 'bg-black/30 text-white border-white/10'
                  : 'bg-white/70 text-charcoal border-black/10'
              }`}
            />

            <TouchableOpacity
              onPress={handleQuickCreateSubmit}
              disabled={createAccountMutation.isPending}
              className="w-full py-3 rounded-xl bg-primary flex-row items-center justify-center"
            >
              {createAccountMutation.isPending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Check size={16} color="white" />
                  <Text className="text-white font-bold text-xs ml-1.5">
                    Save & Use This Account
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-8" />
        ) : (
          <BottomSheetFlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const IconComp = getAccountIcon(item.account_type);
              return (
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    marginBottom: 10,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.06)',
                    overflow: 'hidden',
                  }}
                >
                  <TouchableOpacity
                    onPress={() => handleSelect(item.id, item.name)}
                    className="flex-row items-center p-4"
                  >
                    <View
                      className={`w-10 h-10 rounded-full ${
                        isDark ? 'bg-primary/20' : 'bg-primary/10'
                      } items-center justify-center mr-4`}
                    >
                      <IconComp size={20} color={theme === 'dark' ? '#4ade80' : '#0A6E4A'} />
                    </View>
                    <View className="flex-1">
                      <Text
                        className={`font-semibold ${
                          isDark ? 'text-dark-charcoal' : 'text-charcoal'
                        } text-base`}
                      >
                        {item.name}
                      </Text>
                      <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs`}>
                        {item.provider || item.account_type}
                      </Text>
                    </View>
                    <Text
                      className={`font-semibold ${
                        isDark ? 'text-dark-charcoal' : 'text-charcoal'
                      }`}
                    >
                      {formatGHS(item.balance || 0)}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              <View className="items-center mt-6 px-4">
                <Text
                  className={`text-center font-bold text-base mb-1 ${
                    isDark ? 'text-white' : 'text-charcoal'
                  }`}
                >
                  No payment account set up yet
                </Text>
                <Text
                  className={`text-center text-xs mb-4 ${
                    isDark ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  Start with Physical Cash in one tap or add a Mobile Money / Bank account above.
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    createAccountMutation.mutate({
                      name: 'Physical Cash',
                      account_type: 'cash',
                      provider: 'Physical Cash',
                      opening_balance: 0,
                    })
                  }
                  disabled={createAccountMutation.isPending}
                  className="bg-primary px-5 py-3 rounded-xl flex-row items-center"
                >
                  <Wallet size={16} color="white" />
                  <Text className="text-white font-bold text-xs ml-2">
                    Use Physical Cash (GH₵ 0.00 start)
                  </Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    </BottomSheet>
  );
};

export default AccountPicker;
