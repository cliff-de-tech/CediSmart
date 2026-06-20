import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Home, PieChart, Landmark, Settings, BarChart3, Wallet, Shield } from 'lucide-react-native';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import AddTransactionScreen from '../screens/transactions/AddTransactionScreen';
import AccountsScreen from '../screens/settings/AccountsScreen';
import BudgetsScreen from '../screens/budgets/BudgetsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import { View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Placeholder screens
const Placeholder = ({ name }: { name: string }) => {
  const isDark = useThemeStore((state) => state.theme) === 'dark';
  return (
    <View className={`flex-1 items-center justify-center ${isDark ? 'bg-dark-background' : 'bg-background'}`}>
      <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-lg font-semibold`}>{name} Coming Soon</Text>
    </View>
  );
};

const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  
  // Dynamically adjust height and padding for iPhones with a home indicator
  const bottomPadding = Platform.OS === 'ios' && insets.bottom > 0 ? insets.bottom : 8;
  const tabHeight = 60 + (Platform.OS === 'ios' && insets.bottom > 0 ? insets.bottom - 8 : 0);

  return (
    <Tab.Navigator 
      screenOptions={{ 
        headerShown: false,
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: isDark ? '#b2b6b1' : '#707a6c',
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          borderTopWidth: 0,
          backgroundColor: isDark ? 'rgba(18, 22, 19, 0.85)' : 'rgba(253, 248, 253, 0.95)',
          height: tabHeight + 12,
          paddingBottom: bottomPadding,
          paddingTop: 12,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: isDark ? 0.3 : 0.05,
          shadowRadius: 24,
          elevation: 20,
        },
      }}
    >
      <Tab.Screen 
        name="DashboardTab" 
        component={DashboardScreen} 
        options={{
          tabBarLabel: 'Ledger',
          tabBarIcon: ({ color, focused }) => (
            <View className={focused ? 'bg-primary p-2 rounded-2xl scale-110 shadow-lg shadow-primary/20' : 'p-2'}>
              <Home color={color} size={20} fill={focused ? 'white' : 'none'} />
            </View>
          ),
          tabBarLabelStyle: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
        }}
      />
      <Tab.Screen 
        name="ReportsTab" 
        component={ReportsScreen} 
        options={{
          tabBarLabel: 'Insights',
          tabBarIcon: ({ color, focused }) => (
            <View className={focused ? 'bg-primary p-2 rounded-2xl scale-110 shadow-lg shadow-primary/20' : 'p-2'}>
              <BarChart3 color={color} size={20} fill={focused ? 'white' : 'none'} />
            </View>
          ),
          tabBarLabelStyle: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
        }}
      />
      <Tab.Screen 
        name="BudgetsTab" 
        component={BudgetsScreen} 
        options={{
          tabBarLabel: 'Vault',
          tabBarIcon: ({ color, focused }) => (
            <View className={focused ? 'bg-primary p-2 rounded-2xl scale-110 shadow-lg shadow-primary/20' : 'p-2'}>
              <Shield color={color} size={20} fill={focused ? 'white' : 'none'} />
            </View>
          ),
          tabBarLabelStyle: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
        }}
      />
      <Tab.Screen 
        name="SettingsTab" 
        component={SettingsScreen} 
        options={{
          tabBarLabel: 'Setup',
          tabBarIcon: ({ color, focused }) => (
            <View className={focused ? 'bg-primary p-2 rounded-2xl scale-110 shadow-lg shadow-primary/20' : 'p-2'}>
              <Settings color={color} size={20} fill={focused ? 'white' : 'none'} />
            </View>
          ),
          tabBarLabelStyle: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
        }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen 
        name="Accounts" 
        component={AccountsScreen} 
      />
      <Stack.Screen 
        name="AddTransaction" 
        component={AddTransactionScreen} 
        options={{ 
          presentation: 'modal',
          animation: 'slide_from_bottom'
        }} 
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
