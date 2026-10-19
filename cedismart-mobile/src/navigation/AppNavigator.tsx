import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import AddTransactionScreen from '../screens/transactions/AddTransactionScreen';
import AccountsScreen from '../screens/settings/AccountsScreen';
import BudgetsScreen from '../screens/budgets/BudgetsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import { GlassTabBar } from '../components/glass/GlassTabBar';
import { useAccessibilityPreferences } from '../providers/AccessibilityPreferences';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TabNavigator = () => (
  <Tab.Navigator
    tabBar={props => <GlassTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen name="DashboardTab" component={DashboardScreen} options={{ tabBarLabel: 'Home' }} />
    <Tab.Screen name="ReportsTab" component={ReportsScreen} options={{ tabBarLabel: 'Reports' }} />
    <Tab.Screen name="BudgetsTab" component={BudgetsScreen} options={{ tabBarLabel: 'Budgets' }} />
    <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ tabBarLabel: 'Settings' }} />
  </Tab.Navigator>
);

const AppNavigator = () => {
  const { reduceMotion } = useAccessibilityPreferences();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'default' }}>
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="Accounts" component={AccountsScreen} />
      <Stack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={{ presentation: 'modal', animation: reduceMotion ? 'none' : 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
