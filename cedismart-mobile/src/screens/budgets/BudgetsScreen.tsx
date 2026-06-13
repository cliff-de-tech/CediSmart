import React, { useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, FlatList, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { PieChart, Plus, ChevronDown, Tag, Trash2 } from 'lucide-react-native';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';
import CategoryPicker from '../../components/shared/CategoryPicker';

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
  const queryClient = useQueryClient();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const categoryPickerRef = useRef<BottomSheet>(null);

  // Form State
  const [categoryId, setCategoryId] = useState('');
  const [categoryName, setCategoryName] = useState('Select Category');
  const [amount, setAmount] = useState('');
  const [alertAt, setAlertAt] = useState('80');

  // 1. Fetch current month's budgets
  const { data: budgets, isLoading } = useQuery<Budget[]>({
    queryKey: ['budgets'],
    queryFn: async () => {
      const response = await apiClient.get('/budgets/');
      return response.data;
    }
  });

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

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return '#DC2626'; // Red
    if (percent >= 80) return '#F5A623';  // Orange
    return '#16A34A'; // Green
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
        <Text className="text-3xl font-bold text-charcoal mb-2">My Budgets</Text>
        <Text className="text-gray-500 mb-8">Control your monthly spending</Text>

        {/* Summary Card */}
        <View className="bg-charcoal p-6 rounded-3xl mb-8">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-white/60 font-medium">Monthly Progress</Text>
            <Text className="text-white font-bold">
              {totals.budgeted > 0 ? Math.round((totals.spent / totals.budgeted) * 100) : 0}%
            </Text>
          </View>
          <View className="h-3 w-full bg-white/10 rounded-full overflow-hidden mb-4">
            <View 
              className="h-full bg-primary" 
              style={{ width: `${Math.min(100, totals.budgeted > 0 ? (totals.spent / totals.budgeted) * 100 : 0)}%` }} 
            />
          </View>
          <View className="flex-row justify-between">
            <View>
              <Text className="text-white/50 text-xs mb-1">Spent</Text>
              <Text className="text-white font-bold text-lg">{formatGHS(totals.spent)}</Text>
            </View>
            <View className="items-end">
              <Text className="text-white/50 text-xs mb-1">Budgeted</Text>
              <Text className="text-white font-bold text-lg">{formatGHS(totals.budgeted)}</Text>
            </View>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-8" />
        ) : (
          <FlatList
            data={budgets}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View className="bg-white p-5 rounded-2xl mb-4 border border-gray-100 shadow-sm">
                <View className="flex-row justify-between items-start mb-4">
                  <View className="flex-row items-center flex-1">
                    <View 
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: item.category.color ? `${item.category.color}15` : '#F3F4F6' }}
                    >
                      <Tag size={18} color={item.category.color || '#9CA3AF'} />
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-charcoal text-base">{item.category.name}</Text>
                      <Text className="text-gray-400 text-xs">
                        {formatGHS(item.remaining_amount)} remaining
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    onPress={() => deleteMutation.mutate(item.id)}
                    className="p-2"
                  >
                    <Trash2 size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>

                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-charcoal font-bold text-sm">
                    {formatGHS(item.spent_amount)} <Text className="text-gray-400 font-normal">of {formatGHS(item.budgeted_amount)}</Text>
                  </Text>
                  <Text className="font-bold text-xs" style={{ color: getProgressColor(item.percentage_used) }}>
                    {Math.round(item.percentage_used)}%
                  </Text>
                </View>

                <View className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <View 
                    className="h-full rounded-full" 
                    style={{ 
                      width: `${Math.min(100, item.percentage_used)}%`,
                      backgroundColor: getProgressColor(item.percentage_used)
                    }} 
                  />
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center justify-center py-12">
                <PieChart size={48} color="#D1D5DB" className="mb-4" />
                <Text className="text-gray-400 text-center">No budgets set for this month.{"\n"}Set a limit to start saving!</Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}

        {/* FAB */}
        <TouchableOpacity 
          onPress={() => bottomSheetRef.current?.expand()}
          className="absolute bottom-6 right-6 w-16 h-16 bg-primary rounded-full items-center justify-center shadow-lg shadow-primary/40 active:scale-95"
        >
          <Plus color="white" size={32} />
        </TouchableOpacity>
      </View>

      {/* Add Budget Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['75%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 py-4">
            <View className="flex-row justify-between items-center mb-8">
              <Text className="text-2xl font-bold text-charcoal">Set Budget</Text>
              <TouchableOpacity onPress={() => bottomSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Close</Text>
              </TouchableOpacity>
            </View>

            <View className="space-y-6">
              {/* Category Picker Trigger */}
              <View>
                <Text className="text-sm font-semibold text-charcoal mb-2 ml-1">Spending Category</Text>
                <TouchableOpacity 
                  onPress={() => categoryPickerRef.current?.expand()}
                  className="flex-row items-center justify-between bg-white p-5 rounded-2xl border border-gray-100 shadow-sm"
                >
                  <Text className={`text-lg ${categoryName === 'Select Category' ? 'text-gray-400' : 'text-charcoal'}`}>
                    {categoryName}
                  </Text>
                  <ChevronDown color="#9CA3AF" size={20} />
                </TouchableOpacity>
              </View>

              {/* Amount Input */}
              <View>
                <Text className="text-sm font-semibold text-charcoal mb-2 ml-1">Monthly Limit (GHS)</Text>
                <View className="flex-row items-center bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <Text className="text-xl font-bold text-primary mr-2">₵</Text>
                  <TextInput
                    className="flex-1 text-xl font-bold text-charcoal"
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </View>
              </View>

              {/* Alert Threshold */}
              <View>
                <Text className="text-sm font-semibold text-charcoal mb-2 ml-1">Alert me at (%)</Text>
                <View className="flex-row space-x-2">
                  {['50', '80', '90', '100'].map((val) => (
                    <TouchableOpacity
                      key={val}
                      onPress={() => setAlertAt(val)}
                      className={`flex-1 py-3 items-center rounded-xl border ${alertAt === val ? 'bg-primary border-primary' : 'bg-white border-gray-100'}`}
                    >
                      <Text className={`font-bold ${alertAt === val ? 'text-white' : 'text-gray-400'}`}>{val}%</Text>
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
    </SafeAreaView>
  );
};

export default BudgetsScreen;
