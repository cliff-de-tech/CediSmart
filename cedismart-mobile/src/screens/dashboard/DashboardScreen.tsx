import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { formatGHS } from '../../utils/currency';
import { Plus, CloudOff } from 'lucide-react-native';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';

const DashboardScreen = ({ navigation }: any) => {
  const { user, logout } = useAuthStore();
  const { pendingCount } = useOfflineSync(); // This activates the background listener

  // Fetch summary data from backend
  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ['transactions', 'summary'],
    queryFn: async () => {
      const response = await apiClient.get('/transactions/summary');
      return response.data;
    }
  });

  const income = summary?.current_month?.income ? parseFloat(summary.current_month.income) : 0;
  const expense = summary?.current_month?.expense ? parseFloat(summary.current_month.expense) : 0;
  const net = summary?.current_month?.net ? parseFloat(summary.current_month.net) : 0;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 py-8">
        
        {/* Header */}
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <Text className="text-gray-500 text-lg">Good morning,</Text>
            <Text className="text-2xl font-bold text-charcoal">{user?.full_name || 'User'}</Text>
          </View>
          <View className="flex-row items-center">
            {pendingCount > 0 && (
              <View className="flex-row items-center bg-warning/10 px-3 py-1 rounded-full mr-4">
                <CloudOff size={14} color="#D97706" className="mr-1" />
                <Text className="text-warning text-xs font-bold">{pendingCount}</Text>
              </View>
            )}
            <TouchableOpacity 
              onPress={logout}
              className="bg-gray-200 px-4 py-2 rounded-lg"
            >
              <Text className="text-charcoal font-medium">Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Net Position Card */}
        <View className="bg-primary p-6 rounded-3xl shadow-xl shadow-primary/30 mb-8">
          <Text className="text-white/80 mb-2 text-lg">Net Position</Text>
          
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" className="self-start mb-4" />
          ) : (
            <Text className="text-white text-4xl font-bold mb-4">{formatGHS(net)}</Text>
          )}
          
          <View className="flex-row justify-between border-t border-white/20 pt-4">
            <View>
              <Text className="text-white/70 text-sm">Income</Text>
              <Text className="text-white font-semibold">{formatGHS(income)}</Text>
            </View>
            <View>
              <Text className="text-white/70 text-sm">Expenses</Text>
              <Text className="text-white font-semibold">{formatGHS(expense)}</Text>
            </View>
          </View>
        </View>

        <Text className="text-xl font-bold text-charcoal mb-4">Recent Transactions</Text>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400">No transactions yet.</Text>
        </View>

        {/* Floating Action Button */}
        <TouchableOpacity 
          onPress={() => navigation.navigate('AddTransaction')}
          className="absolute bottom-6 right-6 w-16 h-16 bg-primary rounded-full items-center justify-center shadow-lg shadow-primary/40"
        >
          <Plus color="white" size={32} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default DashboardScreen;
