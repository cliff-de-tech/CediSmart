import React from 'react';
import { useAccessibilityPreferences } from '../providers/AccessibilityPreferences';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import OTPVerifyScreen from '../screens/auth/OTPVerifyScreen';
import SetPINScreen from '../screens/auth/SetPINScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import ForgotPINScreen from '../screens/auth/ForgotPINScreen';

const Stack = createNativeStackNavigator();

const AuthNavigator = () => {
  const { reduceMotion } = useAccessibilityPreferences();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'default' }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="OTPVerify" component={OTPVerifyScreen} />
      <Stack.Screen name="SetPIN" component={SetPINScreen} />
      <Stack.Screen name="ForgotPIN" component={ForgotPINScreen} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
