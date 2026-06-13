import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, Switch, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '../../stores/authStore';
import { useOfflineStore } from '../../stores/offlineStore';
import { User, Shield, Database, LogOut, Trash2, ChevronRight, Smartphone } from 'lucide-react-native';
import { formatGHS } from '../../utils/currency';
import apiClient from '../../api/client';

const SettingItem = ({ icon: Icon, title, value, onPress, color = "#1C1C2E", children }: any) => (
  <TouchableOpacity 
    onPress={onPress}
    disabled={!onPress}
    className="flex-row items-center bg-white p-5 mb-2 rounded-2xl border border-gray-100"
  >
    <View className="w-10 h-10 rounded-full bg-gray-50 items-center justify-center mr-4">
      <Icon size={20} color={color} />
    </View>
    <View className="flex-1">
      <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">{title}</Text>
      {children || <Text className="text-charcoal font-bold text-base">{value}</Text>}
    </View>
    {onPress && <ChevronRight size={20} color="#D1D5DB" />}
  </TouchableOpacity>
);

const SettingsScreen = ({ navigation }: any) => {
  const { user, logout, updateUser } = useAuthStore();
  const { queue, clearQueue } = useOfflineStore();
  
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.full_name || '');

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setIsBiometricSupported(compatible);
    })();
  }, []);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Logout', 
        style: 'destructive', 
        onPress: async () => {
          try {
            // Attempt to inform backend (optional, but good practice)
            const refreshToken = await SecureStore.getItemAsync('refresh_token');
            if (refreshToken) {
              await apiClient.post('/auth/logout', { refresh_token: refreshToken });
            }
          } catch (e) {
            console.warn('Backend logout failed, clearing local session anyway');
          } finally {
            await SecureStore.deleteItemAsync('access_token');
            await SecureStore.deleteItemAsync('refresh_token');
            logout(); // Clear Zustand state
          }
        } 
      },
    ]);
  };

  const handleDeleteAccount = () => {
    // Note: Alert.prompt is iOS only, which fits the user's iPhone XR
    Alert.prompt(
      'Delete Account',
      'This action is permanent and will delete all your financial data. Type "DELETE" to confirm.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async (text) => {
            if (text === 'DELETE') {
              try {
                await apiClient.delete('/users/me');
                await SecureStore.deleteItemAsync('access_token');
                await SecureStore.deleteItemAsync('refresh_token');
                clearQueue(); // Remove any pending offline transactions
                logout(); // Clear Zustand state
                Alert.alert('Success', 'Your account has been deleted.');
              } catch (error) {
                Alert.alert('Error', 'Failed to delete account. Please try again.');
              }
            } else {
              Alert.alert('Error', 'Incorrect confirmation text.');
            }
          } 
        },
      ]
    );
  };

  const saveName = async () => {
    if (!newName.trim()) {
      setIsEditingName(false);
      return;
    }
    try {
      await apiClient.patch('/users/me', { full_name: newName.trim() });
      updateUser({ full_name: newName.trim() });
      setIsEditingName(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update name.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1 px-6 py-8" showsVerticalScrollIndicator={false}>
          <Text className="text-3xl font-bold text-charcoal mb-8">Settings</Text>

          {/* Profile Section */}
          <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1">Profile</Text>
          <SettingItem 
            icon={User} 
            title="Full Name" 
            onPress={() => setIsEditingName(true)}
          >
            {isEditingName ? (
              <TextInput 
                className="text-charcoal font-bold text-base py-1 border-b border-primary/20"
                value={newName}
                onChangeText={setNewName}
                autoFocus
                onBlur={saveName}
                onSubmitEditing={saveName}
                returnKeyType="done"
              />
            ) : (
              <Text className="text-charcoal font-bold text-base">{user?.full_name || 'Set Name'}</Text>
            )}
          </SettingItem>
          <SettingItem icon={Smartphone} title="Phone Number" value={user?.phone} />

          {/* Security Section */}
          <View className="mt-6">
            <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1">Security</Text>
            <SettingItem 
              icon={Shield} 
              title="Biometric Login" 
              onPress={() => isBiometricSupported && setIsBiometricEnabled(!isBiometricEnabled)}
            >
              <View className="flex-row justify-between items-center">
                <Text className="text-charcoal font-bold text-base">
                  {isBiometricSupported ? 'Use FaceID / Fingerprint' : 'Not supported'}
                </Text>
                {isBiometricSupported && (
                  <Switch 
                    value={isBiometricEnabled} 
                    onValueChange={setIsBiometricEnabled}
                    trackColor={{ false: '#D1D5DB', true: '#0A6E4A' }}
                  />
                )}
              </View>
            </SettingItem>
            <SettingItem 
              icon={Shield} 
              title="Security PIN" 
              value="Change 6-digit PIN" 
              onPress={() => Alert.alert('Coming Soon', 'PIN changing will be available in the next update.')}
            />
          </View>

          {/* Data Section */}
          <View className="mt-6">
            <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1">Data & Storage</Text>
            <SettingItem 
              icon={Database} 
              title="Offline Queue" 
              value={`${queue.length} pending items`}
              onPress={() => queue.length > 0 && Alert.alert('Offline Queue', `You have ${queue.length} transactions waiting to sync.`, [
                { text: 'Close' },
                { text: 'Clear Queue', style: 'destructive', onPress: clearQueue }
              ])}
            />
            <SettingItem 
              icon={Database} 
              title="Export History" 
              value="CSV / PDF Export" 
              onPress={() => Alert.alert('CediSmart Pro', 'Exporting is a premium feature. Coming soon!')}
            />
          </View>

          {/* Danger Zone */}
          <View className="mt-10 mb-20">
            <TouchableOpacity 
              onPress={handleLogout}
              className="flex-row items-center bg-white p-5 mb-4 rounded-2xl border border-gray-100 shadow-sm"
            >
              <View className="w-10 h-10 rounded-full bg-gray-50 items-center justify-center mr-4">
                <LogOut size={20} color="#1C1C2E" />
              </View>
              <Text className="text-charcoal font-bold text-base flex-1">Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleDeleteAccount}
              className="flex-row items-center bg-red-50 p-5 rounded-2xl border border-red-100"
            >
              <View className="w-10 h-10 rounded-full bg-white items-center justify-center mr-4">
                <Trash2 size={20} color="#DC2626" />
              </View>
              <Text className="text-error font-bold text-base flex-1">Delete Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SettingsScreen;
