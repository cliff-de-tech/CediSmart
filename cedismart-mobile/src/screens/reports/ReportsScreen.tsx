import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BarChart, LineChart } from "react-native-gifted-charts";
import { Calendar, ChevronLeft, ChevronRight, PieChart as PieIcon, TrendingUp, ArrowDownCircle, ArrowUpCircle } from 'lucide-react-native';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';

const screenWidth = Dimensions.get('window').width;

const ReportsScreen = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  // 1. Fetch Monthly Summary (KPIs)
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['reports', 'monthly', year, month],
    queryFn: async () => {
      const response = await apiClient.get(`/reports/monthly?year=${year}&month=${month}`);
      return response.data;
    }
  });

  // 2. Fetch Category Breakdown
  const { data: categoryData, isLoading: isCategoryLoading } = useQuery({
    queryKey: ['reports', 'categories', year, month],
    queryFn: async () => {
      // We'll use the whole month for the breakdown
      const start = `${year}-${month.toString().padStart(2, '0')}-01`;
      const end = new Date(year, month, 0).toISOString().split('T')[0];
      const response = await apiClient.get(`/reports/categories?start_date=${start}&end_date=${end}&transaction_type=expense`);
      return response.data;
    }
  });

  // 3. Fetch 6-Month Trend
  const { data: trendData, isLoading: isTrendLoading } = useQuery({
    queryKey: ['reports', 'trends'],
    queryFn: async () => {
      const response = await apiClient.get('/reports/trends?months=6');
      return response.data;
    }
  });

  const changeMonth = (offset: number) => {
    const nextDate = new Date(currentDate);
    nextDate.setMonth(currentDate.getMonth() + offset);
    setCurrentDate(nextDate);
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  // Prepare Bar Chart Data (Categories)
  const barData = useMemo(() => {
    if (!categoryData?.categories) return [];
    return categoryData.categories.slice(0, 5).map((cat: any) => ({
      value: parseFloat(cat.amount),
      label: cat.name,
      frontColor: cat.color || '#0A6E4A',
    }));
  }, [categoryData]);

  // Prepare Trend Data (Line Chart)
  const lineData = useMemo(() => {
    if (!trendData?.months) return [];
    return trendData.months.map((m: any) => ({
      value: parseFloat(m.expense),
      label: m.month.toString().padStart(2, '0'), // Simplified for now
      dataPointText: formatGHS(m.expense),
    }));
  }, [trendData]);

  const KPICard = ({ title, amount, icon: Icon, color, textColor }: any) => (
    <View className="flex-1 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm mr-2 last:mr-0">
      <View className={`w-8 h-8 rounded-full items-center justify-center mb-2 ${color}10`}>
        <Icon size={16} color={color} />
      </View>
      <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">{title}</Text>
      <Text className={`font-bold text-sm ${textColor}`}>{formatGHS(amount)}</Text>
    </View>
  );

  const isLoading = isSummaryLoading || isCategoryLoading || isTrendLoading;

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header with Month Selector */}
      <View className="px-6 py-6 bg-white border-b border-gray-100 flex-row justify-between items-center">
        <Text className="text-2xl font-bold text-charcoal">Reports</Text>
        <View className="flex-row items-center bg-gray-50 rounded-full px-3 py-1">
          <TouchableOpacity onPress={() => changeMonth(-1)} className="p-1">
            <ChevronLeft size={20} color="#1C1C2E" />
          </TouchableOpacity>
          <Text className="mx-2 font-bold text-charcoal min-w-[100px] text-center">
            {monthName} {year}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)} className="p-1">
            <ChevronRight size={20} color="#1C1C2E" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-20" />
        ) : (
          <View className="px-6 py-6">
            
            {/* KPI Row */}
            <View className="flex-row mb-8">
              <KPICard 
                title="Income" 
                amount={summary?.total_income || 0} 
                icon={ArrowUpCircle} 
                color="#16A34A" 
                textColor="text-success"
              />
              <KPICard 
                title="Spent" 
                amount={summary?.total_expense || 0} 
                icon={ArrowDownCircle} 
                color="#DC2626" 
                textColor="text-error"
              />
              <KPICard 
                title="Net" 
                amount={summary?.net || 0} 
                icon={TrendingUp} 
                color="#0A6E4A" 
                textColor="text-charcoal"
              />
            </View>

            {/* Category Breakdown */}
            <View className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm mb-8">
              <View className="flex-row items-center mb-6">
                <PieIcon size={20} color="#0A6E4A" className="mr-2" />
                <Text className="text-lg font-bold text-charcoal">Top Expenses</Text>
              </View>
              
              {barData.length > 0 ? (
                <BarChart
                  data={barData}
                  barWidth={22}
                  noOfSections={3}
                  barBorderRadius={4}
                  frontColor="lightgray"
                  yAxisThickness={0}
                  xAxisThickness={0}
                  hideRules
                  labelStyle={{ color: 'gray', fontSize: 10 }}
                  isAnimated
                />
              ) : (
                <Text className="text-gray-400 text-center py-10">No data for this month.</Text>
              )}
            </View>

            {/* Spending Trend */}
            <View className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <View className="flex-row items-center mb-6">
                <TrendingUp size={20} color="#0A6E4A" className="mr-2" />
                <Text className="text-lg font-bold text-charcoal">6-Month Trend</Text>
              </View>

              {lineData.length > 0 ? (
                <LineChart
                  data={lineData}
                  thickness={3}
                  color="#0A6E4A"
                  hideDataPoints
                  noOfSections={3}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  startFillColor="#0A6E4A"
                  endFillColor="#0A6E4A"
                  startOpacity={0.4}
                  endOpacity={0.1}
                  initialSpacing={0}
                  areaChart
                  isAnimated
                />
              ) : (
                <Text className="text-gray-400 text-center py-10">Waiting for more history...</Text>
              )}
            </View>

          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default ReportsScreen;
