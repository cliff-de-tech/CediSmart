import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, ScrollView, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { formatGHS } from '../../utils/currency';
import { Plus, Tag, ArrowRight, Bell, Menu, Landmark, TrendingUp, ArrowDown, ArrowUp, PieChart as PieIcon } from 'lucide-react-native';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';

const { width } = Dimensions.get('window');

interface Transaction {
  id: string;
  amount: string;
  transaction_type: 'income' | 'expense' | 'transfer';
  description: string | null;
  transaction_date: string;
  category: {
    name: string;
    icon: string | null;
    color: string | null;
  };
}

interface Budget {
  id: string;
  budgeted_amount: string;
  spent_amount: string;
  percentage_used: number;
  category: {
    name: string;
    color: string | null;
  };
}

const DashboardScreen = ({ navigation }: any) => {
  const { user, logout } = useAuthStore();
  const { pendingCount } = useOfflineSync();

  const getPersonalizedGreeting = () => {
    if (!user?.full_name) return 'User';
    const parts = user.full_name.trim().split(' ');
    if (parts.length >= 2) {
      const titles = ['Mr.', 'Mrs.', 'Ms.'];
      if (titles.includes(parts[0])) {
        return `${parts[0]} ${parts[1]}`;
      }
      return parts[0];
    }
    return user.full_name;
  };

  const personalizedGreeting = getPersonalizedGreeting();

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['transactions', 'summary'],
    queryFn: async () => {
      const response = await apiClient.get('/transactions/summary');
      return response.data;
    }
  });

  const { data: transactionsData, isLoading: isTransactionsLoading } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: async () => {
      const response = await apiClient.get('/transactions/?per_page=5');
      return response.data;
    }
  });

  const { data: budgets } = useQuery<Budget[]>({
    queryKey: ['budgets'],
    queryFn: async () => {
      const response = await apiClient.get('/budgets/');
      return response.data;
    }
  });

  const income = summary?.current_month?.income ? parseFloat(summary.current_month.income) : 0;
  const expense = summary?.current_month?.expense ? parseFloat(summary.current_month.expense) : 0;
  const net = summary?.current_month?.net ? parseFloat(summary.current_month.net) : 0;
  const transactions = transactionsData?.data || [];

  const renderTransactionItem = ({ item }: { item: Transaction }) => (
    <TouchableOpacity className="flex-row items-center justify-between p-4 bg-surface-container-low rounded-[24px] mb-3 transition-all active:bg-surface-container-high shadow-sm">
      <View className="flex-row items-center flex-1">
        <View 
          className="w-12 h-12 rounded-full items-center justify-center mr-4 bg-surface-container-lowest shadow-sm"
        >
          <Tag size={20} color={item.category.color || '#707a6c'} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-on-surface text-base" numberOfLines={1}>
            {item.description || item.category.name}
          </Text>
          <Text className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold">
            {item.category.name} • {item.transaction_date}
          </Text>
        </View>
      </View>
      <Text className={`font-bold text-base ${item.transaction_type === 'income' ? 'text-primary' : 'text-on-surface'}`}>
        {item.transaction_type === 'income' ? '+' : '-'}{formatGHS(item.amount)}
      </Text>
    </TouchableOpacity>
  );

  const BudgetCard = ({ item }: { item: Budget }) => (
    <View className="min-w-[280px] bg-surface-container-lowest rounded-[32px] p-6 shadow-sm border border-outline-variant/10 mr-4">
      <View className="flex-row justify-between items-center mb-6">
        <View className="w-10 h-10 rounded-xl bg-tertiary/10 items-center justify-center">
          <Tag size={20} color="#993300" />
        </View>
        <Text className="text-[10px] font-bold text-tertiary uppercase tracking-widest">
          {Math.round(item.percentage_used)}% Used
        </Text>
      </View>
      <Text className="font-headline font-bold text-lg mb-1">{item.category.name}</Text>
      <Text className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-4">
        {formatGHS(item.spent_amount)} of {formatGHS(item.budgeted_amount)}
      </Text>
      <View className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
        <View 
          className="bg-tertiary h-full rounded-full" 
          style={{ width: `${Math.min(100, item.percentage_used)}%` }} 
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Sticky Custom AppBar */}
      <View className="flex-row items-center justify-between px-6 py-4">
        <View className="flex-row items-center space-x-4">
          <TouchableOpacity className="p-2 rounded-full bg-surface-container-low active:scale-95 transition-all">
            <Menu size={24} color="#0d631b" />
          </TouchableOpacity>
          <Text className="font-headline font-black text-[#0d631b] text-xl tracking-tight">CediSmart</Text>
        </View>
        <View className="flex-row items-center space-x-3">
          <View className="w-10 h-10 rounded-full bg-primary-container overflow-hidden border border-primary/20">
            <Image 
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCPbtwyh4Eo_96C5zd6dFJFY9kbHP067jJpa7Aayw3aUk1co9x1_rJZOkN1473J1n10wGOmZyH_imPk56BMFUhtqh97n0NlHcDadkkvYPKlykD_wgKQ0fNUrBK4Iu1lJLUicP3eclDQXCGAAWUx5hODGPkFmHdt7ak3QMG9zCIQ1woeQWjZ7lpo8WpbJ3fIQepJ_Q7ZT7r1xyJBsDS0TdhOmQJP54CdoizSC8UpE8ln59Y5-6_lJNv8GhvkiAlc4Ddi9D8xyhpQ_YM' }} 
              className="w-full h-full"
            />
          </View>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="px-6 pt-6 pb-24">
          {/* Header Section */}
          <View className="mb-8">
            <Text className="text-on-surface-variant font-label uppercase tracking-widest text-[10px] mb-2">Dashboard Overview</Text>
            <Text className="text-4xl font-headline font-extrabold tracking-tight leading-none text-on-surface">
              Good Morning,{"\n"}{personalizedGreeting}
            </Text>
          </View>

          {/* Net Position Hero Card */}
          <View className="relative overflow-hidden rounded-[40px] bg-primary p-8 shadow-2xl mb-10">
            {/* Watermark */}
            <View className="absolute top-0 right-0 opacity-10 translate-x-1/4 -translate-y-1/4">
              <Landmark size={240} color="white" strokeWidth={1} />
            </View>

            <View className="relative z-10">
              <View className="flex-row justify-between items-start mb-10">
                <View>
                  <Text className="text-white/70 font-label text-[10px] uppercase tracking-widest mb-1">Current Net Position</Text>
                  {isSummaryLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" className="self-start mt-2" />
                  ) : (
                    <Text className="text-4xl md:text-5xl font-headline font-extrabold tracking-tighter text-white">
                      {formatGHS(net)}
                    </Text>
                  )}
                </View>
                <View className="bg-white/20 px-3 py-1.5 rounded-xl flex-row items-center space-x-1">
                  <TrendingUp size={14} color="white" />
                  <Text className="text-white text-xs font-bold font-label">+4.2%</Text>
                </View>
              </View>

              <View className="flex-row justify-between pt-8 border-t border-white/10">
                <View>
                  <Text className="text-white/60 font-label text-[10px] uppercase tracking-widest block mb-1">Total Income</Text>
                  <View className="flex-row items-center space-x-2">
                    <ArrowDown size={18} color="white" />
                    <Text className="text-xl font-bold text-white">{formatGHS(income)}</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-white/60 font-label text-[10px] uppercase tracking-widest block mb-1">Total Expenses</Text>
                  <View className="flex-row items-center space-x-2">
                    <ArrowUp size={18} color="#ffdbcf" />
                    <Text className="text-xl font-bold text-white">{formatGHS(expense)}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Budgets Section */}
          <View className="mb-10">
            <View className="flex-row justify-between items-end mb-6 px-1">
              <Text className="text-xl font-bold font-headline tracking-tight text-on-surface">Active Budgets</Text>
              <TouchableOpacity onPress={() => navigation.navigate('MainTabs', { screen: 'BudgetsTab' })}>
                <Text className="text-primary text-sm font-bold">View All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="overflow-visible" contentContainerStyle={{ paddingRight: 20 }}>
              {budgets?.length ? (
                budgets.map((b) => <BudgetCard key={b.id} item={b} />)
              ) : (
                <View className="w-[280px] bg-surface-container-low rounded-[32px] p-8 items-center justify-center border border-dashed border-outline-variant/30">
                  <PieIcon size={32} color="#bfcaba" className="mb-2" />
                  <Text className="text-on-surface-variant text-[10px] font-bold uppercase text-center">No Budgets Active</Text>
                </View>
              )}
            </ScrollView>
          </View>

          {/* Recent Activity */}
          <View className="mb-12">
            <View className="flex-row justify-between items-end mb-6 px-1">
              <Text className="text-xl font-bold font-headline tracking-tight text-on-surface">Recent Activity</Text>
              <TouchableOpacity>
                <Text className="text-primary text-sm font-bold">History</Text>
              </TouchableOpacity>
            </View>
            
            {isTransactionsLoading ? (
              <ActivityIndicator size="large" color="#0d631b" className="mt-12" />
            ) : (
              <View className="space-y-4">
                {transactions.length > 0 ? (
                  transactions.map((item: any) => (
                    <View key={item.id}>
                      {renderTransactionItem({ item })}
                    </View>
                  ))
                ) : (
                  <View className="items-center justify-center py-16 bg-surface-container-low rounded-[32px] border border-dashed border-outline-variant/30">
                    <Text className="text-on-surface-variant font-medium text-center">No transactions yet.</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity 
        onPress={() => navigation.navigate('AddTransaction')}
        style={{ bottom: 110 }}
        className="absolute right-6 w-16 h-16 bg-primary rounded-[24px] items-center justify-center shadow-2xl shadow-primary/50 active:scale-90 transition-all z-50"
      >
        <Plus color="white" size={32} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default DashboardScreen;
