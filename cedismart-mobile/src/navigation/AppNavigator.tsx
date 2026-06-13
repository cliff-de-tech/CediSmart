import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Home, PieChart, Landmark, Settings } from 'lucide-react-native';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import AddTransactionScreen from '../screens/transactions/AddTransactionScreen';
import { View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Placeholder screens
const Placeholder = ({ name }: { name: string }) => (
  <View className="flex-1 items-center justify-center bg-background">
    <Text className="text-charcoal text-lg font-semibold">{name} Coming Soon</Text>
  </View>
);

const BudgetsPlaceholder = () => <Placeholder name="Budgets" />;
const AccountsPlaceholder = () => <Placeholder name="Accounts" />;
const SettingsPlaceholder = () => <Placeholder name="Settings" />;

const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  
  // Dynamically adjust height and padding for iPhones with a home indicator
  const bottomPadding = Platform.OS === 'ios' && insets.bottom > 0 ? insets.bottom : 8;
  const tabHeight = 60 + (Platform.OS === 'ios' && insets.bottom > 0 ? insets.bottom - 8 : 0);

  return (
    <Tab.Navigator 
      screenOptions={{ 
        headerShown: false,
        tabBarActiveTintColor: '#0A6E4A',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#F3F4F6',
          height: tabHeight,
          paddingBottom: bottomPadding,
          paddingTop: 8,
        }
      }}
    >
      <Tab.Screen 
        name="DashboardTab" 
        component={DashboardScreen} 
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="BudgetsTab" 
        component={BudgetsPlaceholder} 
        options={{
          tabBarLabel: 'Budgets',
          tabBarIcon: ({ color, size }) => <PieChart color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="AccountsTab" 
        component={AccountsPlaceholder} 
        options={{
          tabBarLabel: 'Accounts',
          tabBarIcon: ({ color, size }) => <Landmark color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="SettingsTab" 
        component={SettingsPlaceholder} 
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen 
        name="AddTransaction" 
        component={AddTransactionScreen} 
        options={{ presentation: 'modal' }} 
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
