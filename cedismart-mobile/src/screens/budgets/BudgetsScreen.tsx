import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { GlassSheetBackground } from '../../components/glass/GlassSheetBackground';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassSurface } from '../../components/glass/GlassSurface';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGlassTabBarMetrics } from '../../components/glass/useGlassTabBarMetrics';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert, TextInput, RefreshControl, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { PieChart, Plus, ChevronDown, Tag, Trash2, Headphones } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';
import CategoryPicker from '../../components/shared/CategoryPicker';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { SupportModal } from '../../components/shared/SupportModal';
import { TopBarSupportTooltip } from '../../components/shared/TopBarSupportTooltip';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../stores/authStore';

interface Budget {
  id: string;
  budgeted_amount: string;
  spent_amount: string;
  remaining_amount: string;
  percentage_used: number;
  alert_at_percent: number;
  is_over_budget: boolean;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  };
  period: {
    year: number;
    month: number;
  };
}

const BudgetsScreen = () => {
  const { clearance: tabBarClearance } = useGlassTabBarMetrics();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const categoryPickerRef = useRef<BottomSheet>(null);
  const user = useAuthStore((state) => state.user);

  // Form State
  const [categoryId, setCategoryId] = useState('');
  const [categoryName, setCategoryName] = useState('Select Category');
  const [amount, setAmount] = useState('');
  const [alertAt, setAlertAt] = useState('80');
  const [defaultThreshold, setDefaultThreshold] = useState(80);
  const [isSupportModalVisible, setIsSupportModalVisible] = useState(false);
  const [startFreshSupport, setStartFreshSupport] = useState(false);

  // Load user's default budget alert threshold on mount
  useEffect(() => {
    if (user?.id) {
      AsyncStorage.getItem(`budget_alert_threshold_${user.id}`).then((val) => {
        if (val) {
          const numericVal = parseFloat(val);
          const percentVal = Math.round(numericVal * 100);
          setDefaultThreshold(percentVal);
          setAlertAt(percentVal.toString());
        }
      });
    }
  }, [user?.id]);

  // 1. Fetch current month's budgets
  const { data: budgets, isLoading, refetch } = useQuery<Budget[]>({
    queryKey: ['budgets', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/budgets/');
      return response.data;
    },
    enabled: !!user?.id
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (e) {
      console.error('Failed to manually refresh budgets:', e);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const totals = useMemo(() => {
    if (!budgets) return { budgeted: 0, spent: 0 };
    return budgets.reduce((acc, curr) => ({
      budgeted: acc.budgeted + parseFloat(curr.budgeted_amount),
      spent: acc.spent + parseFloat(curr.spent_amount),
    }), { budgeted: 0, spent: 0 });
  }, [budgets]);

  const upsertMutation = useMutation({
    mutationFn: (newBudget: any) => apiClient.post('/budgets/', newBudget),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      Alert.alert('Success', 'Budget set successfully!');
      bottomSheetRef.current?.close();
      // Reset form
      setCategoryId('');
      setCategoryName('Select Category');
      setAmount('');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to set budget');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (budgetId: string) => apiClient.delete(`/budgets/${budgetId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    }
  });

  const handleSave = () => {
    if (!categoryId || !amount) {
      Alert.alert('Missing Info', 'Please select a category and enter an amount.');
      return;
    }
    upsertMutation.mutate({
      category_id: categoryId,
      amount: parseFloat(amount),
      alert_at_percent: parseInt(alertAt) || 80
    });
  };

  const getProgressColor = (percent: number, alertAtPercent: number = 80) => {
    if (percent >= 100) return '#DC2626'; // Red
    if (percent >= alertAtPercent) return '#F5A623';  // Orange
    return '#16A34A'; // Green
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-background'}`}>
      <CoinBackground />
      <View className="flex-1 px-6 py-8">
        <View className="flex-row justify-between items-start mb-8">
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className={`text-3xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2`}>My Budgets</Text>
            <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Control your monthly spending</Text>
          </View>
          <GlassButton accessibilityLabel="Budget AI Support" onPress={() => { setStartFreshSupport(false); setIsSupportModalVisible(true); }} style={{ marginLeft: 12 }}>
            <Headphones size={19} color={isDark ? '#4ade80' : '#0d631b'} />
          </GlassButton>
        </View>

        {/* Summary Card */}
        <GlassSurface tint="emerald" elevated radius={28} style={{ marginBottom: 32 }}>
          <View className="relative overflow-hidden p-6">
            <View className="absolute top-0 right-0 opacity-10 translate-x-4 -translate-y-4">
              <PieChart size={150} color={isDark ? '#4ade80' : '#0d631b'} strokeWidth={1} />
            </View>
            <View className="relative z-10">
              <View className="flex-row justify-between items-center mb-4">
                <Text className={`${isDark ? 'text-white/70' : 'text-charcoal/70'} text-[10px] font-bold uppercase tracking-widest`}>Monthly Progress</Text>
                <Text className={`${isDark ? 'text-white' : 'text-charcoal'} font-extrabold text-sm`}>
                  {totals.budgeted > 0 ? Math.round((totals.spent / totals.budgeted) * 100) : 0}%
                </Text>
              </View>
              <View className={`h-3 w-full ${isDark ? 'bg-white/15' : 'bg-black/10'} rounded-full overflow-hidden mb-4`}>
                <View 
                  className="h-full bg-success rounded-full" 
                  style={{ width: `${Math.min(100, totals.budgeted > 0 ? (totals.spent / totals.budgeted) * 100 : 0)}%` }} 
                />
              </View>
              <View className="flex-row justify-between">
                <View>
                  <Text className={`${isDark ? 'text-white/60' : 'text-charcoal/60'} text-[9px] font-bold uppercase tracking-widest mb-1`}>Spent</Text>
                  <Text className={`${isDark ? 'text-white' : 'text-charcoal'} font-bold text-base`}>{formatGHS(totals.spent)}</Text>
                </View>
                <View className="items-end">
                  <Text className={`${isDark ? 'text-white/60' : 'text-charcoal/60'} text-[9px] font-bold uppercase tracking-widest mb-1`}>Budgeted</Text>
                  <Text className={`${isDark ? 'text-white' : 'text-charcoal'} font-bold text-base`}>{formatGHS(totals.budgeted)}</Text>
                </View>
              </View>
            </View>
          </View>
        </GlassSurface>

        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-8" />
        ) : (
          <FlatList
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh} 
                tintColor={isDark ? '#FFFFFF' : '#0A6E4A'}
                colors={['#0A6E4A']}
              />
            }
            data={budgets}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.budgetCard,
                  {
                    backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : 'rgba(255, 255, 255, 0.96)',
                    borderColor: isDark ? 'rgba(164, 243, 185, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <View className="p-5">
                  <View className="flex-row justify-between items-start mb-4">
                    <View className="flex-row items-center flex-1">
                      <View 
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: item.category.color ? `${item.category.color}20` : (theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') }}
                      >
                        <Tag size={18} color={item.category.color || (theme === 'dark' ? '#b2b6b1' : '#9CA3AF')} />
                      </View>
                      <View className="flex-1">
                        <Text className={`font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base`}>{item.category.name}</Text>
                        <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs`}>
                          {formatGHS(item.remaining_amount)} remaining
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                      onPress={() => {
                        Alert.alert(
                          'Remove Budget?',
                          `Are you sure you want to remove your monthly budget for ${item.category.name}?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
                          ]
                        );
                      }}
                      className="p-2"
                    >
                      <Trash2 size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row justify-between items-center mb-2">
                    <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-sm`}>
                      {formatGHS(item.spent_amount)} <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} font-normal`}>of {formatGHS(item.budgeted_amount)}</Text>
                    </Text>
                    <Text className="font-bold text-xs" style={{ color: getProgressColor(item.percentage_used, item.alert_at_percent) }}>
                      {Math.round(item.percentage_used)}%
                    </Text>
                  </View>

                  <View className={`h-2 w-full ${isDark ? 'bg-white/10' : 'bg-black/10'} rounded-full overflow-hidden`}>
                    <View 
                      className="h-full rounded-full" 
                      style={{ 
                        width: `${Math.min(100, item.percentage_used)}%`,
                        backgroundColor: getProgressColor(item.percentage_used, item.alert_at_percent)
                      }} 
                    />
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <GlassSurface radius={26} style={{ marginTop: 12 }}>
                <View className="items-center justify-center py-12 px-6">
                  <PieChart size={48} color={theme === 'dark' ? '#4ade80' : '#0d631b'} className="mb-4" />
                  <Text className={`${isDark ? 'text-gray-300' : 'text-gray-600'} text-center`}>No budgets set for this month.{"\n"}Set a limit to start saving!</Text>
                </View>
              </GlassSurface>
            }
            contentContainerStyle={{ paddingBottom: tabBarClearance + 80 }}
          />
        )}
      </View>

      {/* FAB */}
      <GlassButton
        accessibilityLabel="Create budget"
        onPress={() => bottomSheetRef.current?.snapToIndex(0)}
        size={60} elevated
        style={{ position: 'absolute', bottom: tabBarClearance, right: 24, zIndex: 50 }}
      >
        <Plus color={isDark ? '#a4f3b9' : '#0d631b'} size={30} />
      </GlassButton>

      {/* Add Budget Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['82%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}>
          <View className="px-6 py-4">
            <View className="flex-row justify-between items-center mb-8">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Set Budget</Text>
              <TouchableOpacity onPress={() => bottomSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Close</Text>
              </TouchableOpacity>
            </View>

            <View className="space-y-6">
              {/* Category Picker Trigger */}
              <View>
                <Text className={`text-sm font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>Spending Category</Text>
                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                    },
                  ]}
                >
                  <TouchableOpacity 
                    onPress={() => categoryPickerRef.current?.snapToIndex(0)}
                    className="flex-row items-center justify-between p-5"
                  >
                    <Text className={`text-lg ${categoryName === 'Select Category' ? (isDark ? 'text-gray-400' : 'text-gray-500') : (isDark ? 'text-dark-charcoal' : 'text-charcoal')}`}>
                      {categoryName}
                    </Text>
                    <ChevronDown color={theme === 'dark' ? '#9ca3af' : '#6b7280'} size={20} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Amount Input */}
              <View className="mt-4">
                <Text className={`text-sm font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>Monthly Limit (₵)</Text>
                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                    },
                  ]}
                >
                  <View className="flex-row items-center p-5">
                    <Text className={`text-xl font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'} mr-2`}>₵</Text>
                    <TextInput
                      className={`flex-1 text-xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={theme === 'dark' ? '#6b7280' : '#9ca3af'}
                      value={amount}
                      onChangeText={setAmount}
                    />
                  </View>
                </View>
              </View>

              {/* Alert Threshold */}
              <View className="mt-4">
                <Text className={`text-sm font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>Alert me at (%)</Text>
                <View className="flex-row">
                  {['50', '80', '90', '100'].map((val) => (
                    <TouchableOpacity
                      key={val}
                      onPress={() => setAlertAt(val)}
                      className={`flex-1 py-3 mx-1 items-center rounded-xl border ${alertAt === val ? 'bg-primary border-primary' : isDark ? 'bg-black/25 border-white/10' : 'bg-white/60 border-black/10'}`}
                    >
                      <Text className={`font-bold ${alertAt === val ? 'text-white' : isDark ? 'text-gray-300' : 'text-gray-600'}`}>{val}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View className="mt-10">
              <TouchableOpacity
                onPress={handleSave}
                disabled={upsertMutation.isPending}
                className={`w-full py-5 rounded-2xl items-center justify-center shadow-lg ${
                  upsertMutation.isPending ? 'bg-gray-300' : 'bg-primary shadow-primary/30'
                }`}
              >
                <Text className="text-white font-bold text-lg">
                  {upsertMutation.isPending ? 'Saving...' : 'Set Budget'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Category Picker Sub-Sheet */}
      <CategoryPicker 
        bottomSheetRef={categoryPickerRef}
        type="expense"
        onSelect={(id, name) => {
          setCategoryId(id);
          setCategoryName(name);
        }}
      />

      {/* Anchored Top-Bar AI Support Speech Bubble Tooltip */}
      <TopBarSupportTooltip
        userName={user?.full_name}
        screenContext="budgets"
        arrowRightOffset={24}
        topOffset={74}
        onOpenSupport={(opts) => {
          setStartFreshSupport(!!opts?.startNewChat);
          setIsSupportModalVisible(true);
        }}
      />

      {/* AI Support Modal */}
      <SupportModal
        visible={isSupportModalVisible}
        onClose={() => setIsSupportModalVisible(false)}
        phone={user?.phone}
        userName={user?.full_name}
        screenContext="budgets"
        startNewChatOnOpen={startFreshSupport}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  budgetCard: {
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  inputContainer: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
});

export default BudgetsScreen;
