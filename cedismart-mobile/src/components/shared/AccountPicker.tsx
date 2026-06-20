import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import { useThemeStore } from '../../stores/themeStore';
import apiClient from '../../api/client';
import { Landmark } from 'lucide-react-native';
import { formatGHS } from '../../utils/currency';

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
  const snapPoints = useMemo(() => ['50%', '100%'], []);

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await apiClient.get('/accounts/');
      return response.data;
    }
  });

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

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 24 }}
      handleIndicatorStyle={{ backgroundColor: theme === 'dark' ? '#374151' : '#D1D5DB', width: 40 }}
    >
      <View className="px-6 pb-4">
        <Text className={`text-xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-4`}>Select Account</Text>
        
        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-8" />
        ) : (
          <BottomSheetFlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelect(item.id, item.name)}
                className={`flex-row items-center p-4 mb-2 ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'} rounded-xl border`}
              >
                <View className={`w-10 h-10 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center mr-4`}>
                  <Landmark size={20} color={theme === 'dark' ? '#2e7d32' : '#0A6E4A'} />
                </View>
                <View className="flex-1">
                  <Text className={`font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base`}>{item.name}</Text>
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-sm`}>{item.provider || item.account_type}</Text>
                </View>
                <Text className={`font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>{formatGHS(item.balance || 0)}</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              <Text className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-8`}>No accounts found.</Text>
            }
          />
        )}
      </View>
    </BottomSheet>
  );
};

export default AccountPicker;
