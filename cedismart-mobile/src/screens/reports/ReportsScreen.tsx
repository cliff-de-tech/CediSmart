import React, { useState, useMemo, useCallback } from 'react';
import { GlassSurface } from '../../components/glass/GlassSurface';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGlassTabBarMetrics } from '../../components/glass/useGlassTabBarMetrics';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BarChart, LineChart } from "react-native-gifted-charts";
import { ChevronLeft, ChevronRight, PieChart as PieIcon, TrendingUp, ArrowDownCircle, ArrowUpCircle } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';
import { CoinBackground } from '../../components/shared/CoinBackground';

const ReportsScreen = () => {
  const { width: screenWidth } = useWindowDimensions();
  const { clearance: tabBarClearance } = useGlassTabBarMetrics();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const user = useAuthStore((state) => state.user);
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  // 1. Fetch Monthly Summary (KPIs)
  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['reports', user?.id, 'monthly', year, month],
    enabled: !!user?.id,
    queryFn: async () => {
      const response = await apiClient.get(`/reports/monthly?year=${year}&month=${month}`);
      return response.data;
    }
  });

  // 2. Fetch Category Breakdown
  const { data: categoryData, isLoading: isCategoryLoading, refetch: refetchCategory } = useQuery({
    queryKey: ['reports', user?.id, 'categories', year, month],
    enabled: !!user?.id,
    queryFn: async () => {
      // We'll use the whole month for the breakdown
      const start = `${year}-${month.toString().padStart(2, '0')}-01`;
      const end = new Date(year, month, 0).toISOString().split('T')[0];
      const response = await apiClient.get(`/reports/categories?start_date=${start}&end_date=${end}&transaction_type=expense`);
      return response.data;
    }
  });

  // 3. Fetch 6-Month Trend
  const { data: trendData, isLoading: isTrendLoading, refetch: refetchTrend } = useQuery({
    queryKey: ['reports', user?.id, 'trends', year, month],
    enabled: !!user?.id,
    queryFn: async () => {
      const response = await apiClient.get(`/reports/trends?months=6&end_year=${year}&end_month=${month}`);
      return response.data;
    }
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchSummary(),
        refetchCategory(),
        refetchTrend(),
      ]);
    } catch (e) {
      console.error('Failed to manually refresh reports data:', e);
    } finally {
      setRefreshing(false);
    }
  }, [refetchSummary, refetchCategory, refetchTrend]);

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
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return trendData.months.map((m: any) => {
      const monthIdx = parseInt(m.month) - 1;
      const monthLabel = monthIdx >= 0 && monthIdx < 12 ? monthNames[monthIdx] : m.month.toString();
      return {
        value: parseFloat(m.expense),
        label: monthLabel,
        dataPointText: formatGHS(m.expense),
      };
    });
  }, [trendData]);

  // Calculate exact inner plot width so grid lines & x-axis labels stay strictly inside the GlassSurface card
  // Outer padding: 24*2 = 48, Card padding: 20*2 = 40, Y-axis label width: 38
  const chartPlotWidth = Math.max(180, screenWidth - 48 - 40 - 42);
  const lineInitialSpacing = 18;
  const lineEndSpacing = 18;
  const lineSpacing = useMemo(() => {
    const segments = Math.max(1, lineData.length - 1);
    return Math.max(28, Math.floor((chartPlotWidth - lineInitialSpacing - lineEndSpacing) / segments));
  }, [chartPlotWidth, lineData.length]);

  const barSpacing = useMemo(() => {
    const count = Math.max(1, barData.length);
    return Math.max(16, Math.floor((chartPlotWidth - 28 - count * 22) / count));
  }, [chartPlotWidth, barData.length]);

  const KPICard = ({ title, amount, icon: Icon, color, textColor }: any) => (
    <GlassSurface radius={24} style={{ flex: 1, minWidth: 0 }}>
      <View style={{ padding: 14 }}>
        <View 
          className="w-8 h-8 rounded-full items-center justify-center mb-2"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon size={16} color={color} />
        </View>
        <Text
          className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-[10px] font-bold uppercase tracking-wider mb-1`}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          className={`font-bold text-sm ${textColor}`}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {formatGHS(amount)}
        </Text>
      </View>
    </GlassSurface>
  );

  const isLoading = isSummaryLoading || isCategoryLoading || isTrendLoading;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-background'}`}>
      <CoinBackground />
      {/* Header with Month Selector */}
      <View
        className="px-6 pt-4 pb-4 flex-row flex-wrap justify-between items-center"
        style={{ gap: 12 }}
      >
        <Text className={`text-3xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Reports</Text>
        <GlassSurface radius={24} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => changeMonth(-1)}
            style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={20} color={isDark ? '#e1e3e0' : '#1C1C2E'} />
          </TouchableOpacity>
          <Text className={`mx-1.5 font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} min-w-[105px] text-center text-sm`}>
            {monthName} {year}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => changeMonth(1)}
            style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronRight size={20} color={isDark ? '#e1e3e0' : '#1C1C2E'} />
          </TouchableOpacity>
        </GlassSurface>
      </View>

      <ScrollView 
        className="flex-1" 
        contentContainerStyle={{ paddingBottom: tabBarClearance + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor={isDark ? '#FFFFFF' : '#0A6E4A'}
            colors={['#0A6E4A']}
          />
        }
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-20" />
        ) : (
          <View className="px-6 py-4">
            
            {/* KPI Row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
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
                title="Saved / Left" 
                amount={summary?.net || 0} 
                icon={TrendingUp} 
                color="#0A6E4A" 
                textColor={isDark ? 'text-dark-charcoal' : 'text-charcoal'}
              />
            </View>

            {/* Plain-Language Monthly Takeaway Card */}
            <GlassSurface radius={24} style={{ marginBottom: 24 }}>
              <View className="p-4">
                <Text className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-[#4ade80]' : 'text-primary'} mb-1`}>
                  {monthName} Takeaway
                </Text>
                <Text className={`text-xs leading-5 ${isDark ? 'text-gray-200' : 'text-charcoal'}`}>
                  {(() => {
                    const totalIncome = parseFloat(summary?.total_income || '0');
                    const totalSpent = parseFloat(summary?.total_expense || '0');
                    const netLeft = parseFloat(summary?.net || '0');
                    const topCat = categoryData?.categories?.[0];
                    if (totalIncome === 0 && totalSpent === 0) {
                      return `No income or expenses recorded for ${monthName} ${year} yet. Log your daily spending on the Home tab to see where your money goes.`;
                    }
                    const topPart = topCat
                      ? ` Your biggest spending category was ${topCat.name} (${formatGHS(topCat.amount)}).`
                      : '';
                    const netPart =
                      netLeft >= 0
                        ? ` You kept ${formatGHS(netLeft)} after expenses.`
                        : ` You spent ${formatGHS(Math.abs(netLeft))} more than your recorded income.`;
                    return `In ${monthName}, you earned ${formatGHS(totalIncome)} and spent ${formatGHS(totalSpent)}.${topPart}${netPart}`;
                  })()}
                </Text>
              </View>
            </GlassSurface>

            {/* Category Breakdown */}
            <GlassSurface radius={28} elevated style={{ marginBottom: 24 }}>
              <View style={{ padding: 20, overflow: 'hidden' }}>
                <View className="flex-row items-center mb-5">
                  <PieIcon size={20} color={isDark ? '#4ade80' : '#0A6E4A'} />
                  <Text className={`text-lg font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} ml-2.5`}>Top Expenses</Text>
                </View>
                
                {barData.length > 0 ? (
                  <View style={{ width: '100%', overflow: 'hidden' }}>
                    <BarChart
                      data={barData}
                      width={chartPlotWidth}
                      barWidth={22}
                      spacing={barSpacing}
                      initialSpacing={14}
                      noOfSections={3}
                      barBorderRadius={6}
                      frontColor="#16A34A"
                      yAxisThickness={0}
                      xAxisThickness={0}
                      yAxisLabelWidth={38}
                      hideRules
                      xAxisLabelTextStyle={{ color: isDark ? '#e1e3e0' : '#1c221e', fontSize: 10, fontWeight: '600' }}
                      yAxisTextStyle={{ color: isDark ? '#c4cec6' : '#40493d', fontSize: 10, fontWeight: '600' }}
                      isAnimated
                    />
                  </View>
                ) : (
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-center py-10`}>No data for this month.</Text>
                )}
              </View>
            </GlassSurface>

            {/* Spending Trend */}
            <GlassSurface radius={28} elevated>
              <View style={{ padding: 20, overflow: 'hidden' }}>
                <View className="flex-row items-center mb-5">
                  <TrendingUp size={20} color={isDark ? '#4ade80' : '#0A6E4A'} />
                  <Text className={`text-lg font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} ml-2.5`}>6-Month Trend</Text>
                </View>

                {lineData.length > 0 ? (
                  <View style={{ width: '100%', overflow: 'hidden' }}>
                    <LineChart
                      data={lineData}
                      width={chartPlotWidth}
                      spacing={lineSpacing}
                      initialSpacing={lineInitialSpacing}
                      endSpacing={lineEndSpacing}
                      thickness={3}
                      color={isDark ? '#4ade80' : '#0A6E4A'}
                      hideDataPoints={false}
                      dataPointsColor={isDark ? '#86efac' : '#0A6E4A'}
                      dataPointsRadius={3.5}
                      noOfSections={3}
                      yAxisThickness={0}
                      xAxisThickness={1}
                      xAxisColor={isDark ? 'rgba(74, 222, 128, 0.35)' : 'rgba(10, 110, 74, 0.25)'}
                      yAxisLabelWidth={38}
                      rulesLength={chartPlotWidth}
                      rulesColor={isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)'}
                      startFillColor={isDark ? '#4ade80' : '#0A6E4A'}
                      endFillColor={isDark ? '#2e7d32' : '#0A6E4A'}
                      startOpacity={0.35}
                      endOpacity={0.05}
                      areaChart
                      curved
                      isAnimated
                      xAxisLabelTextStyle={{ color: isDark ? '#e1e3e0' : '#1c221e', fontSize: 10, fontWeight: '600', width: 34, textAlign: 'center' }}
                      yAxisTextStyle={{ color: isDark ? '#c4cec6' : '#40493d', fontSize: 10, fontWeight: '600' }}
                    />
                  </View>
                ) : (
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-center py-10`}>Waiting for more history...</Text>
                )}
              </View>
            </GlassSurface>

          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default ReportsScreen;

