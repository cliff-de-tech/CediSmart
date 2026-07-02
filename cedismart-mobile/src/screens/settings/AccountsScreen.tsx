import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, TextInput, ScrollView, Modal, RefreshControl, Platform, PermissionsAndroid, Clipboard, Linking, NativeModules, Image } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Landmark, Wallet, Smartphone, Trash2, ChevronRight, Shield, Eye, EyeOff, Zap, CheckCircle2, Info, ExternalLink, Copy } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { useFocusEffect } from '@react-navigation/native';

interface Account {
  id: string;
  name: string;
  account_type: 'bank' | 'mobile_money' | 'cash';
  provider: string | null;
  account_number?: string | null;
  balance: string;
  is_active: boolean;
}

const PROVIDER_LOGOS: Record<string, any> = {
  'mtn momo': require('../../../assets/mtn_logo.png'),
  'mtn': require('../../../assets/mtn_logo.png'),
  'telecel cash': require('../../../assets/telecel_logo.png'),
  'telecel': require('../../../assets/telecel_logo.png'),
  'vodafone cash': require('../../../assets/telecel_logo.png'),
  'vodafone': require('../../../assets/telecel_logo.png'),
  'airteltigo money': require('../../../assets/airteltigo_logo.png'),
  'airteltigo': require('../../../assets/airteltigo_logo.png'),
  'at money': require('../../../assets/airteltigo_logo.png'),
  'absa bank': require('../../../assets/absa_logo.png'),
  'absa': require('../../../assets/absa_logo.png'),
  'gcb bank': require('../../../assets/gcb_logo.png'),
  'gcb': require('../../../assets/gcb_logo.png'),
  'ecobank': require('../../../assets/ecobank_logo.png'),
  'stanbic bank': require('../../../assets/stanbic_logo.png'),
  'stanbic': require('../../../assets/stanbic_logo.png'),
};

const renderProviderLogo = (providerName: string | null, isDark: boolean) => {
  const rawKey = (providerName || '').toLowerCase().trim();
  
  if (PROVIDER_LOGOS[rawKey]) {
    return (
      <View 
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: '#FFFFFF',
          padding: 2,
          marginRight: 10,
          borderWidth: 1,
          borderColor: 'rgba(156, 163, 175, 0.15)',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden'
        }}
      >
        <Image 
          source={PROVIDER_LOGOS[rawKey]} 
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain" 
        />
      </View>
    );
  }
  
  const initials = rawKey.slice(0, 2).toUpperCase();
  return (
    <View 
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(10, 110, 74, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10
      }}
    >
      <Text 
        style={{
          fontFamily: 'Outfit-Bold',
          fontWeight: '900',
          fontSize: 12,
          color: isDark ? '#FFFFFF' : '#0A6E4A'
        }}
      >
        {initials || 'FI'}
      </Text>
    </View>
  );
};

const AccountsScreen = ({ navigation }: any) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const cashSheetRef = useRef<BottomSheet>(null);
  
  // Local Cash State
  const [cashInput, setCashInput] = useState('0');
  const [hiddenAccounts, setHiddenAccounts] = useState<Record<string, boolean>>({});
  const user = useAuthStore((state) => state.user);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        AsyncStorage.getItem(`hidden_accounts_${user.id}`).then((val) => {
          if (val) {
            try {
              setHiddenAccounts(JSON.parse(val));
            } catch (e) {
              setHiddenAccounts({});
            }
          } else {
            setHiddenAccounts({});
          }
        });
      }
    }, [user?.id])
  );

  const toggleAccountVisibility = async (accountId: string) => {
    if (user?.id) {
      const updated = {
        ...hiddenAccounts,
        [accountId]: !hiddenAccounts[accountId]
      };
      setHiddenAccounts(updated);
      await AsyncStorage.setItem(`hidden_accounts_${user.id}`, JSON.stringify(updated));
      Haptics.selectionAsync().catch(() => {});
    }
  };

  // Link Form State
  const [linkingType, setLinkingType] = useState<'momo' | 'bank' | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [startingBalance, setStartingBalance] = useState('250.00');
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // KYC Verification state
  const [isKycVerified, setIsKycVerified] = useState(false);
  const [showKycExplanation, setShowKycExplanation] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [activeSyncTab, setActiveSyncTab] = useState<'ios' | 'android'>(Platform.OS === 'ios' ? 'ios' : 'android');

  useEffect(() => {
    const checkKycStatus = async () => {
      if (user?.id) {
        const val = await AsyncStorage.getItem(`kyc_verified_${user.id}`);
        setIsKycVerified(val === 'true');
      }
    };

    checkKycStatus();

    const unsubscribe = navigation.addListener('focus', () => {
      checkKycStatus();
    });

    return unsubscribe;
  }, [navigation, user?.id]);

  const { data: accounts, isLoading, refetch } = useQuery<Account[]>({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/accounts/');
      return response.data;
    },
    enabled: !!user?.id
  });

  // Sync MoMo details to Android SharedPreferences if available
  useEffect(() => {
    const updateAndroidSyncConfig = async () => {
      if (Platform.OS !== 'android') return;
      if (!NativeModules.MomoSyncModule) return;

      if (accounts && accounts.length > 0) {
        // Find the first mobile money account
        const momoAccount = accounts.find((acc) => acc.account_type === 'mobile_money');
        if (momoAccount && momoAccount.account_number) {
          try {
            const token = await SecureStore.getItemAsync('access_token');
            if (token) {
              const apiUrl = apiClient.defaults.baseURL || 'https://api.cedismart.com/api/v1';
              NativeModules.MomoSyncModule.saveConfig(token, momoAccount.account_number, apiUrl);
              console.log('Android SMS background sync config saved/updated successfully.');
            }
          } catch (e) {
            console.error('Failed to save auto-sync config to Android Preferences', e);
          }
          return;
        }
      }
      
      try {
        NativeModules.MomoSyncModule.clearConfig();
      } catch (err) {}
    };

    updateAndroidSyncConfig();
  }, [accounts]);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (e) {
      console.error('Failed to manually refresh accounts:', e);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const totalBalance = useMemo(() => {
    if (!accounts) return 0;
    return accounts.reduce((acc, curr) => acc + parseFloat(curr.balance), 0);
  }, [accounts]);

  const cashAccount = useMemo(() => {
    return accounts?.find(acc => acc.account_type === 'cash');
  }, [accounts]);

  const isMomoLinked = useMemo(() => {
    return accounts?.some(acc => acc.account_type === 'mobile_money');
  }, [accounts]);

  const isBankLinked = useMemo(() => {
    return accounts?.some(acc => acc.account_type === 'bank');
  }, [accounts]);

  // Sync cash balance from backend when loaded
  useEffect(() => {
    if (cashAccount) {
      setCashInput(parseFloat(cashAccount.balance).toString());
    } else {
      setCashInput('0');
    }
  }, [cashAccount]);

  // Mutation to save/update physical cash amount
  const saveCashMutation = useMutation({
    mutationFn: async (amount: number) => {
      if (cashAccount) {
        return apiClient.patch(`/accounts/${cashAccount.id}`, {
          opening_balance: amount
        });
      } else {
        return apiClient.post('/accounts/', {
          name: 'Physical Cash',
          account_type: 'cash',
          provider: 'Cash',
          opening_balance: amount
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      Alert.alert('Success', 'Physical cash amount updated successfully!');
      cashSheetRef.current?.close();
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.error?.message || 'Failed to update cash amount.');
    }
  });

  // Mutation to link a MoMo or Bank account
  const createMutation = useMutation({
    mutationFn: (newAccount: any) => apiClient.post('/accounts/', newAccount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      Alert.alert('Success', 'Account linked successfully!');
      bottomSheetRef.current?.close();
      setIdentifier('');
      setStartingBalance('250.00');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to link account.');
    }
  });

  // Mutation to delete/disconnect account
  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => apiClient.delete(`/accounts/${accountId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      Alert.alert('Success', 'Account disconnected successfully.');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to disconnect account.');
    }
  });

  const handleLink = () => {
    const cleanId = identifier.trim().replace(/\s+/g, '');
    if (!cleanId) {
      Alert.alert('Missing Info', `Please enter your ${linkingType === 'momo' ? 'phone number' : 'account number'}.`);
      return;
    }

    if (linkingType === 'momo') {
      // Validate mobile number: exactly 10 digits starting with 0
      const phoneRegex = /^0\d{9}$/;
      if (!phoneRegex.test(cleanId)) {
        Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number starting with 0.');
        return;
      }

      // Ghanaian network operators prefix validation
      const prefix = cleanId.substring(0, 3);
      if (selectedProvider === 'MTN MoMo') {
        const mtnPrefixes = ['024', '054', '055', '059', '025', '053'];
        if (!mtnPrefixes.includes(prefix)) {
          Alert.alert(
            'Invalid Provider Number',
            `The phone number prefix (${prefix}) does not match MTN MoMo.\n\nValid MTN prefixes: ${mtnPrefixes.join(', ')}`
          );
          return;
        }
      } else if (selectedProvider === 'Telecel Cash') {
        const telecelPrefixes = ['020', '050'];
        if (!telecelPrefixes.includes(prefix)) {
          Alert.alert(
            'Invalid Provider Number',
            `The phone number prefix (${prefix}) does not match Telecel Cash.\n\nValid Telecel prefixes: ${telecelPrefixes.join(', ')}`
          );
          return;
        }
      } else if (selectedProvider === 'AirtelTigo Money') {
        const atPrefixes = ['026', '056', '027', '057'];
        if (!atPrefixes.includes(prefix)) {
          Alert.alert(
            'Invalid Provider Number',
            `The phone number prefix (${prefix}) does not match AirtelTigo Money.\n\nValid AirtelTigo prefixes: ${atPrefixes.join(', ')}`
          );
          return;
        }
      }
    } else {
      // Validate bank account: strictly 10 to 16 digits
      const bankRegex = /^\d{10,16}$/;
      if (!bankRegex.test(cleanId)) {
        Alert.alert('Invalid Account', 'Please enter a valid bank account number (10 to 16 digits).');
        return;
      }
    }

    const parsedBalance = parseFloat(startingBalance);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      Alert.alert('Invalid Balance', 'Please enter a valid starting balance.');
      return;
    }

    setIsAuthorizing(true);
    setTimeout(() => {
      setIsAuthorizing(false);
      // Simulate Consent Gateway name verification
      const resolvedName = cleanId.endsWith('99') ? 'Ama Serwaa' : (user?.full_name || 'Verified User');
      
      if (resolvedName !== user?.full_name) {
        Alert.alert(
          'Verification Failed',
          `Consent Gateway resolved this account to '${resolvedName}', which does not match your verified Ghana Card name ('${user?.full_name || 'Holder'}').\n\nFor compliance and security, you can only link portals registered under your own name.`,
          [{ text: 'OK' }]
        );
        return;
      }

      // If it matches, prompt to confirm
      Alert.alert(
        'Confirm Account Details',
        `Consent Gateway resolved this account to:\n\nName: ${resolvedName}\nProvider: ${selectedProvider}\n\nDo you authorize CediSmart to link this portal?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Link Portal',
            onPress: () => {
              createMutation.mutate({
                name: linkingType === 'momo' ? `${selectedProvider} Wallet` : `${selectedProvider} Account`,
                account_type: linkingType === 'momo' ? 'mobile_money' : 'bank',
                provider: selectedProvider,
                account_number: cleanId,
                opening_balance: parsedBalance
              });
            }
          }
        ]
      );
    }, 2000);
  };

  const confirmDisconnect = (accountId: string, accountName: string) => {
    Alert.alert(
      'Disconnect Source',
      `Are you sure you want to disconnect ${accountName}? This will stop tracking transaction history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Disconnect', 
          style: 'destructive', 
          onPress: () => deleteMutation.mutate(accountId) 
        }
      ]
    );
  };

  const openLinkSheet = (type: 'momo' | 'bank') => {
    if (type === 'bank' && !isKycVerified) {
      setShowKycExplanation(true);
      return;
    }

    setLinkingType(type);
    if (type === 'momo') {
      setSelectedProvider('MTN MoMo');
      setStartingBalance('250.00');
    } else {
      setSelectedProvider('GCB Bank');
      setStartingBalance('1200.00');
    }
    setIdentifier('');
    bottomSheetRef.current?.snapToIndex(0);
  };

  const getAccountIcon = (type: string) => {
    const color = theme === 'dark' ? '#2e7d32' : '#0A6E4A';
    switch (type) {
      case 'bank': return <Landmark size={24} color={color} />;
      case 'mobile_money': return <Smartphone size={24} color={color} />;
      default: return <Wallet size={24} color={color} />;
    }
  };


  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  const filteredLinkedAccounts = useMemo(() => {
    if (!accounts) return [];
    // Only show banks and mobile money in the active list (cash is managed inline via card)
    return accounts.filter(acc => acc.account_type !== 'cash');
  }, [accounts]);

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-background'}`}>
      <CoinBackground />
      <ScrollView 
        className="flex-1 px-6 py-8" 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor={isDark ? '#FFFFFF' : '#1C1C2E'}
            colors={['#1C1C2E']}
          />
        }
      >
        <Text className={`text-3xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2`}>My Accounts</Text>
        <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} mb-8`}>Add/Track your sources of Income.</Text>

        {/* Total net worth */}
        <View className="relative overflow-hidden bg-charcoal p-6 rounded-3xl mb-8 shadow-md">
          <View className="absolute top-0 right-0 opacity-5 translate-x-4 -translate-y-4">
            <Landmark size={150} color="white" strokeWidth={1} />
          </View>
          <View className="relative z-10">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Total Net Worth</Text>
              <TouchableOpacity
                onPress={() => toggleAccountVisibility('total')}
                className="bg-white/20 px-3 py-1.5 rounded-xl flex-row items-center active:bg-white/30"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {hiddenAccounts['total'] ? (
                  <EyeOff size={14} color="white" />
                ) : (
                  <Eye size={14} color="white" />
                )}
                <Text className="text-white text-[10px] font-bold ml-1.5">{hiddenAccounts['total'] ? 'Show' : 'Hide'}</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-white text-3xl font-extrabold tracking-tight">
              {hiddenAccounts['total'] ? "₵ ••••" : formatGHS(totalBalance)}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-8" />
        ) : (
          <View className="space-y-6 mb-12">
            {/* SOURCE CARDS */}
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest ml-1 mb-2`}>Linking Sources</Text>

            {/* MoMo Card */}
            <TouchableOpacity 
              onPress={() => openLinkSheet('momo')}
              className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'} p-5 rounded-2xl border shadow-sm mb-4 active:scale-[0.99] transition-all`}
            >
              <View className={`w-12 h-12 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center mr-4`}>
                <Smartphone size={24} color={isDark ? '#2e7d32' : '#0A6E4A'} />
              </View>
              <View className="flex-1">
                <Text className={`font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base`}>Link MoMo Account</Text>
                <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-0.5`}>MTN, Telecel, AirtelTigo Wallet</Text>
              </View>
              {isMomoLinked ? (
                <Text className="text-success font-bold text-sm mr-2">LINKED</Text>
              ) : (
                <ChevronRight size={20} color={isDark ? '#4B5563' : '#D1D5DB'} />
              )}
            </TouchableOpacity>

            {/* Bank Card */}
            <TouchableOpacity 
              onPress={() => openLinkSheet('bank')}
              className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'} p-5 rounded-2xl border shadow-sm mb-4 active:scale-[0.99] transition-all`}
            >
              <View className={`w-12 h-12 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center mr-4`}>
                <Landmark size={24} color={isDark ? '#2e7d32' : '#0A6E4A'} />
              </View>
              <View className="flex-1">
                <Text className={`font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base`}>Link Bank Account</Text>
                <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-0.5`}>Link your local Ghanaian bank account</Text>
              </View>
              {isBankLinked ? (
                <Text className="text-success font-bold text-sm mr-2">LINKED</Text>
              ) : (
                <ChevronRight size={20} color={isDark ? '#4B5563' : '#D1D5DB'} />
              )}
            </TouchableOpacity>

            {/* Physical Cash Card */}
            <TouchableOpacity 
              onPress={() => {
                setCashInput(cashAccount ? parseFloat(cashAccount.balance).toString() : '0.00');
                cashSheetRef.current?.snapToIndex(0);
              }}
              className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'} p-5 rounded-2xl border shadow-sm mb-6 active:scale-[0.99] transition-all`}
            >
              <View className={`w-12 h-12 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center mr-4`}>
                <Wallet size={24} color={isDark ? '#2e7d32' : '#0A6E4A'} />
              </View>
              <View className="flex-1">
                <Text className={`font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base`}>Physical Cash</Text>
                <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-0.5`}>Manual cash in your wallet</Text>
              </View>
              <View className="flex-row items-center mr-2">
                <Text className={`font-bold text-base ${isDark ? 'text-[#2e7d32]' : 'text-primary'}`}>
                  {hiddenAccounts['cash'] ? "₵ ••••" : (cashAccount ? formatGHS(cashAccount.balance) : '₵0.00')}
                </Text>
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); toggleAccountVisibility('cash'); }}
                  className="ml-2"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {hiddenAccounts['cash'] ? (
                    <EyeOff size={14} color={isDark ? '#2e7d32' : '#0A6E4A'} />
                  ) : (
                    <Eye size={14} color={isDark ? '#2e7d32' : '#0A6E4A'} />
                  )}
                </TouchableOpacity>
              </View>
              <ChevronRight size={20} color={isDark ? '#4B5563' : '#D1D5DB'} />
            </TouchableOpacity>

            {/* ACTIVE SOURCES LIST */}
            {filteredLinkedAccounts.length > 0 && (
              <View className="mt-4">
                <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest ml-1 mb-4`}>Linked Portals</Text>
                {filteredLinkedAccounts.map((item) => {
                  const card = (() => {
                    switch (item.provider) {
                      case 'MTN MoMo':
                        return {
                          bg: 'bg-amber-400 border-amber-500/20',
                          text: 'text-black',
                          sub: 'text-black/60',
                          logo: 'MTN MoMo',
                          chip: 'bg-black/80',
                          accentColor: '#000000',
                        };
                      case 'Telecel Cash':
                        return {
                          bg: 'bg-red-600 border-red-700/20',
                          text: 'text-white',
                          sub: 'text-white/60',
                          logo: 'telecel cash',
                          chip: 'bg-amber-400/80',
                          accentColor: '#ffffff',
                        };
                      case 'AirtelTigo Money':
                      case 'AirtelTigo':
                        return {
                          bg: 'bg-blue-600 border-blue-700/20',
                          text: 'text-white',
                          sub: 'text-white/60',
                          logo: 'at money',
                          chip: 'bg-amber-400/80',
                          accentColor: '#ffffff',
                        };
                      case 'GCB Bank':
                        return {
                          bg: 'bg-emerald-800 border-emerald-900/20',
                          text: 'text-amber-100',
                          sub: 'text-white/60',
                          logo: 'GCB Bank',
                          chip: 'bg-amber-400/80',
                          accentColor: '#FFF8E7',
                        };
                      case 'Ecobank':
                        return {
                          bg: 'bg-cyan-700 border-cyan-800/20',
                          text: 'text-white',
                          sub: 'text-white/60',
                          logo: 'Ecobank',
                          chip: 'bg-amber-400/80',
                          accentColor: '#ffffff',
                        };
                      case 'Stanbic Bank':
                        return {
                          bg: 'bg-blue-800 border-blue-900/20',
                          text: 'text-white',
                          sub: 'text-white/60',
                          logo: 'Stanbic Bank',
                          chip: 'bg-amber-400/80',
                          accentColor: '#ffffff',
                        };
                      case 'ABSA Bank':
                        return {
                          bg: 'bg-rose-950 border-rose-900/20',
                          text: 'text-rose-100',
                          sub: 'text-rose-300',
                          logo: 'absa',
                          chip: 'bg-amber-400/80',
                          accentColor: '#ffe4e6',
                        };
                      default:
                        return {
                          bg: isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-[#eef5f0] border-gray-100',
                          text: isDark ? 'text-white' : 'text-charcoal',
                          sub: isDark ? 'text-gray-400' : 'text-gray-500',
                          logo: item.provider || 'Sovereign Account',
                          chip: isDark ? 'bg-white/10' : 'bg-[#0d631b]/10',
                          accentColor: isDark ? '#4ade80' : '#0A6E4A',
                        };
                    }
                  })();

                  // Mask phone/account number visually
                  const maskedDigits = item.account_number 
                    ? (item.account_type === 'mobile_money'
                      ? `${item.account_number.slice(0, 3)} ••• ••• ${item.account_number.slice(-2)}`
                      : `•••• •••• •••• ${item.account_number.slice(-4)}`)
                    : `•••• •••• •••• ${item.id.slice(-4)}`;

                  return (
                    <View 
                      key={item.id} 
                      className={`relative overflow-hidden w-full h-44 rounded-3xl p-6 mb-6 border shadow-lg ${card.bg}`}
                    >
                      {/* Visual Shimmer Watermarks */}
                      <View className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full translate-x-8 -translate-y-8" />
                      <View className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full translate-x-4 translate-y-4" />

                      {/* Upper Card Row */}
                      <View className="flex-row justify-between items-center z-10 w-full">
                        <View className="flex-row items-center">
                          {renderProviderLogo(item.provider, isDark)}
                          <View>
                            <Text className={`font-headline font-black text-sm tracking-wide uppercase ${card.text}`}>
                              {card.logo}
                            </Text>
                            <Text className={`font-body text-[8px] uppercase font-bold tracking-widest ${card.sub}`}>
                              {item.account_type === 'mobile_money' ? 'MOMO PORTAL' : 'SECURE VAULT'}
                            </Text>
                          </View>
                        </View>
                        
                        <TouchableOpacity 
                          onPress={() => confirmDisconnect(item.id, item.name)}
                          className={`p-2.5 rounded-full ${item.provider === 'MTN MoMo' ? 'bg-black/10' : 'bg-white/10'} active:scale-95`}
                        >
                          <Trash2 size={18} color={card.accentColor} />
                        </TouchableOpacity>
                      </View>

                      {/* Middle Card Row: Chip & Balance */}
                      <View className="flex-row items-center justify-between mt-4 z-10">
                        {/* Chip Graphic */}
                        <View className={`w-9 h-7 rounded-md ${card.chip} border ${item.provider === 'MTN MoMo' ? 'border-black/20' : 'border-white/20'} flex-row flex-wrap p-1`}>
                          <View className="w-full h-[1px] bg-white/20 mb-1" />
                          <View className="w-1/2 h-2 bg-white/20 mr-1" />
                          <View className="w-1/3 h-2 bg-white/20" />
                        </View>

                        {/* Balance */}
                        <View className="flex-row items-center">
                          <Text className={`font-headline font-black text-2xl tracking-tight ${card.text}`}>
                            {hiddenAccounts[item.id] ? "₵ ••••" : formatGHS(item.balance)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => toggleAccountVisibility(item.id)}
                            className="ml-2"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            {hiddenAccounts[item.id] ? (
                              <EyeOff size={16} color={card.accentColor} />
                            ) : (
                              <Eye size={16} color={card.accentColor} />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Bottom Card Row */}
                      <View className="flex-row justify-between items-end mt-auto z-10">
                        <Text className={`font-body text-xs font-semibold tracking-widest ${card.sub}`}>
                          {maskedDigits}
                        </Text>
                        <Text className={`font-headline font-black text-[10px] tracking-widest ${card.sub} uppercase`}>
                          {user?.full_name || 'HOLDER'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                
                {accounts?.some((acc: any) => acc.account_type === 'mobile_money') && (
                  <View className={`mt-2 p-5 rounded-3xl border ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-emerald-50/50 border-emerald-100'} mb-6`}>
                    <View className="flex-row items-center mb-3">
                      <View className={`p-2 rounded-xl ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'} mr-3`}>
                        <Zap size={20} color="#10B981" />
                      </View>
                      <View>
                        <Text className={`font-headline font-black text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>
                          ⚡ Mobile Money Live Sync
                        </Text>
                        <Text className={`font-body text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Auto-log transactions & keep balance updated
                        </Text>
                      </View>
                    </View>
                    <Text className={`font-body text-xs leading-5 mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Keep your wallet records perfectly reconciled in the background using automated SMS parsing.
                    </Text>
                    <TouchableOpacity 
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setShowSyncModal(true);
                      }}
                      className="bg-primary py-3.5 px-6 rounded-2xl items-center active:scale-[0.98]"
                    >
                      <Text className="text-white font-bold text-xs">Configure Auto-Sync (iOS / Android)</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Generic Link Source Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['85%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-5 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                {linkingType === 'momo' ? 'Link Mobile Money' : 'Link Bank Account'}
              </Text>
              <TouchableOpacity onPress={() => bottomSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Provider/Bank Grid Selector */}
            <Text className={`text-[10px] uppercase font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-3 tracking-widest ml-1`}>
              Select {linkingType === 'momo' ? 'Operator' : 'Bank'}
            </Text>
            
            <View className="flex-row flex-wrap justify-between mb-6">
              {linkingType === 'momo' ? (
                ['MTN MoMo', 'Telecel Cash', 'AirtelTigo Money'].map((providerName) => (
                  <TouchableOpacity
                    key={providerName}
                    onPress={() => setSelectedProvider(providerName)}
                    className={`w-[48%] items-center py-5 px-3 rounded-2xl border mb-3 ${
                      selectedProvider === providerName 
                        ? 'bg-primary border-primary shadow-sm shadow-primary/20' 
                        : isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'
                    }`}
                  >
                    {PROVIDER_LOGOS[providerName.toLowerCase().trim()] && (
                      <View 
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          backgroundColor: '#FFFFFF',
                          padding: 4,
                          marginBottom: 8,
                          borderWidth: 1,
                          borderColor: selectedProvider === providerName ? 'rgba(255,255,255,0.2)' : 'rgba(156, 163, 175, 0.15)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          overflow: 'hidden'
                        }}
                      >
                        <Image 
                          source={PROVIDER_LOGOS[providerName.toLowerCase().trim()]} 
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="contain" 
                        />
                      </View>
                    )}
                    <Text className={`text-xs font-bold text-center ${selectedProvider === providerName ? 'text-white' : isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                      {providerName}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                ['GCB Bank', 'Ecobank', 'Stanbic Bank', 'ABSA Bank'].map((bankName) => (
                  <TouchableOpacity
                    key={bankName}
                    onPress={() => setSelectedProvider(bankName)}
                    className={`w-[48%] items-center py-5 px-3 rounded-2xl border mb-3 ${
                      selectedProvider === bankName 
                        ? 'bg-primary border-primary shadow-sm shadow-primary/20' 
                        : isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'
                    }`}
                  >
                    {PROVIDER_LOGOS[bankName.toLowerCase().trim()] && (
                      <View 
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          backgroundColor: '#FFFFFF',
                          padding: 4,
                          marginBottom: 8,
                          borderWidth: 1,
                          borderColor: selectedProvider === bankName ? 'rgba(255,255,255,0.2)' : 'rgba(156, 163, 175, 0.15)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          overflow: 'hidden'
                        }}
                      >
                        <Image 
                          source={PROVIDER_LOGOS[bankName.toLowerCase().trim()]} 
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="contain" 
                        />
                      </View>
                    )}
                    <Text className={`text-xs font-bold text-center ${selectedProvider === bankName ? 'text-white' : isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                      {bankName}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            {/* Form Fields */}
            <View className="space-y-4">
              <View>
                <Text className={`text-xs font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>
                  {linkingType === 'momo' ? 'Wallet Phone Number' : 'Account Number'}
                </Text>
                <TextInput
                  className={`${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 text-dark-charcoal' : 'bg-white border-gray-100 text-charcoal'} px-4 py-4 rounded-xl border text-base shadow-sm`}
                  placeholder={linkingType === 'momo' ? 'e.g. 054 123 4567' : 'e.g. 104101002345'}
                  placeholderTextColor={isDark ? '#4b5563' : '#D1D5DB'}
                  keyboardType={linkingType === 'momo' ? 'phone-pad' : 'number-pad'}
                  value={identifier}
                  onChangeText={setIdentifier}
                />
              </View>

              <View>
                <Text className={`text-xs font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>Simulated Current Balance (₵)</Text>
                <View className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'} px-4 py-4 rounded-xl border shadow-sm`}>
                  <Text className={`text-lg font-bold ${isDark ? 'text-[#2e7d32]' : 'text-primary'} mr-2`}>₵</Text>
                  <TextInput
                    className={`flex-1 text-lg font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} p-0`}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={isDark ? '#4b5563' : '#D1D5DB'}
                    value={startingBalance}
                    onChangeText={setStartingBalance}
                  />
                </View>
              </View>
            </View>

            <View className="mt-10">
              <TouchableOpacity
                onPress={handleLink}
                disabled={createMutation.isPending || isAuthorizing}
                className={`w-full py-4 rounded-xl items-center justify-center shadow-lg ${
                  createMutation.isPending || isAuthorizing ? 'bg-gray-300' : 'bg-primary shadow-primary/30'
                }`}
              >
                <Text className="text-white font-bold text-base">
                  {createMutation.isPending ? 'Linking Portal...' : isAuthorizing ? 'Authorizing Consent Gateway...' : `Link ${linkingType === 'momo' ? 'Wallet' : 'Account'}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Physical Cash Bottom Sheet */}
      <BottomSheet
        ref={cashSheetRef}
        index={-1}
        snapPoints={['85%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-5 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-headline`}>Physical Cash</Text>
              <TouchableOpacity onPress={() => cashSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} font-body text-xs mb-6 leading-relaxed`}>
              Manually set or adjust the physical cash in hand you want tracked.
            </Text>

            {/* Manual Entry Input */}
            <View className="mb-6">
              <Text className={`text-xs font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>Cash Balance (₵)</Text>
              <View className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'} px-4 py-4 rounded-xl border shadow-sm`}>
                <Text className={`text-lg font-bold ${isDark ? 'text-[#2e7d32]' : 'text-primary'} mr-2`}>₵</Text>
                <TextInput
                  className={`flex-1 text-lg font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} p-0`}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={isDark ? '#4b5563' : '#D1D5DB'}
                  value={cashInput}
                  onChangeText={(val) => setCashInput(val)}
                />
              </View>
            </View>

            {/* Presets Grid */}
            <Text className={`text-[10px] uppercase font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-3 tracking-widest ml-1`}>Suggested Presets</Text>
            <View className="flex-row flex-wrap justify-between mb-6">
              {['20.00', '50.00', '100.00', '200.00', '500.00', '1000.00'].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  onPress={() => setCashInput(preset)}
                  className={`w-[31%] items-center py-3 rounded-xl border ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 active:bg-dark-surface-container-low' : 'bg-white border-gray-100 active:bg-gray-50'} mb-2 active:scale-95`}
                >
                  <Text className={`text-xs font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-body`}>₵{preset}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick Increments/Decrements */}
            <Text className={`text-[10px] uppercase font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-3 tracking-widest ml-1`}>Quick Adjustments</Text>
            <View className="flex-row justify-between mb-8">
              {[
                { label: '- ₵10', value: -10 },
                { label: '+ ₵10', value: 10 },
                { label: '+ ₵50', value: 50 },
                { label: '+ ₵100', value: 100 },
              ].map((adjust, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    const currentVal = parseFloat(cashInput) || 0;
                    const newVal = Math.max(0, currentVal + adjust.value);
                    setCashInput(newVal.toFixed(2));
                  }}
                  className={`w-[22%] items-center py-3 rounded-xl border ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 active:bg-dark-surface-container-low' : 'bg-white border-gray-100 active:bg-gray-50'} active:scale-95`}
                >
                  <Text className={`text-xs font-bold ${isDark ? 'text-[#2e7d32]' : 'text-primary'} font-body`}>{adjust.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="mt-6">
              <TouchableOpacity
                onPress={() => {
                  const amt = parseFloat(cashInput);
                  if (isNaN(amt) || amt < 0) {
                    Alert.alert('Invalid Amount', 'Please enter a valid positive number for physical cash.');
                    return;
                  }
                  saveCashMutation.mutate(amt);
                }}
                disabled={saveCashMutation.isPending}
                className={`w-full py-4 rounded-xl items-center justify-center shadow-lg ${
                  saveCashMutation.isPending ? 'bg-gray-300' : 'bg-primary shadow-primary/30'
                }`}
              >
                <Text className="text-white font-bold text-base">
                  {saveCashMutation.isPending ? 'Saving...' : 'Update Cash Balance'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* KYC Explanation Modal */}
      <Modal
        visible={showKycExplanation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowKycExplanation(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          <View className={`w-full ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'} p-6 rounded-3xl border shadow-2xl`}>
            {/* Header */}
            <View className="items-center mb-6">
              <View className={`w-14 h-14 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center mb-4`}>
                <Shield size={28} color={isDark ? '#2e7d32' : '#0A6E4A'} />
              </View>
              <Text className={`text-xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-center`}>
                Verification Required
              </Text>
              <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs text-center mt-2 leading-relaxed px-2`}>
                To connect live bank accounts or Mobile Money wallets, we need to verify your identity. Here is why:
              </Text>
            </View>

            {/* Explanation Items */}
            <View className="space-y-4 mb-8">
              <View className="flex-row items-start">
                <View className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 mr-3" />
                <View className="flex-1">
                  <Text className={`font-bold text-sm ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Regulatory Compliance</Text>
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-0.5 leading-relaxed`}>
                    In accordance with Bank of Ghana (BoG) open banking directives, identity verification (KYC) is legally required before connecting active financial accounts.
                  </Text>
                </View>
              </View>

              <View className="flex-row items-start">
                <View className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 mr-3" />
                <View className="flex-1">
                  <Text className={`font-bold text-sm ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Fraud Prevention</Text>
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-0.5 leading-relaxed`}>
                    This security layer guarantees that only the authentic owner can link these accounts, shielding you from identity theft and unauthorized access.
                  </Text>
                </View>
              </View>

              <View className="flex-row items-start">
                <View className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 mr-3" />
                <View className="flex-1">
                  <Text className={`font-bold text-sm ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Privacy & Data Encryption</Text>
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-0.5 leading-relaxed`}>
                    Your data is encrypted and verified directly against the National Identification Authority (NIA) database. CediSmart never stores your card number on our servers.
                  </Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View className="space-y-3">
              <TouchableOpacity
                onPress={() => {
                  setShowKycExplanation(false);
                  navigation.navigate('SettingsTab', { openKyc: true, redirectTo: 'Accounts' });
                }}
                className="w-full py-4 bg-primary rounded-xl items-center justify-center shadow-lg shadow-primary/30"
              >
                <Text className="text-white font-bold text-base">Verify with Ghana Card</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowKycExplanation(false)}
                className={`w-full py-4 rounded-xl items-center justify-center border ${isDark ? 'border-dark-outline-variant/10 bg-dark-surface-container-low' : 'border-gray-100 bg-gray-50'}`}
              >
                <Text className={`font-bold text-base ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Maybe Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mobile Money Auto-Sync Configuration Modal */}
      <Modal
        visible={showSyncModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSyncModal(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className={`w-full max-h-[85%] rounded-t-[32px] p-6 pb-10 ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-white'}`}>
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <View>
                <Text className={`font-headline font-black text-xl ${isDark ? 'text-white' : 'text-charcoal'}`}>
                  ⚡ Mobile Money Auto-Sync
                </Text>
                <Text className={`font-body text-[11px] mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Real-time transaction tracking setup
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => setShowSyncModal(false)}
                className="bg-primary/10 px-4 py-2 rounded-full active:scale-95"
              >
                <Text className="text-primary font-bold text-xs">Done</Text>
              </TouchableOpacity>
            </View>

            {/* Segmented OS Selector Control */}
            <View className={`flex-row p-1 rounded-2xl mb-6 ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-gray-100'}`}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActiveSyncTab('ios');
                }}
                className={`flex-1 py-3 items-center rounded-xl flex-row justify-center ${activeSyncTab === 'ios' ? 'bg-primary' : ''}`}
              >
                <Text className={`font-bold text-xs ${activeSyncTab === 'ios' ? 'text-white' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  🍎 Apple iOS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActiveSyncTab('android');
                }}
                className={`flex-1 py-3 items-center rounded-xl flex-row justify-center ${activeSyncTab === 'android' ? 'bg-primary' : ''}`}
              >
                <Text className={`font-bold text-xs ${activeSyncTab === 'android' ? 'text-white' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  🤖 Google Android
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {activeSyncTab === 'ios' ? (
                // --- iOS Shortcut Webhook Guide ---
                <View className="space-y-5">
                  <View className={`p-4 rounded-2xl flex-row ${isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-100'}`}>
                    <Info size={18} color="#3B82F6" className="mr-3 mt-0.5" />
                    <Text className={`flex-1 font-body text-xs leading-5 ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>
                      iOS sandboxing blocks apps from reading SMS alerts directly. Follow the steps below to configure Apple's native Shortcuts app to securely forward MoMo messages to CediSmart in the background.
                    </Text>
                  </View>

                  {/* Step 1 */}
                  <View className="flex-row items-start">
                    <View className="w-6 h-6 rounded-full bg-primary/20 items-center justify-center mr-3 mt-0.5">
                      <Text className="text-primary font-bold text-xs">1</Text>
                    </View>
                    <View className="flex-1">
                      <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>Configure Automation Trigger</Text>
                      <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-1 leading-relaxed`}>
                        Open the native Apple <Text className="font-bold">Shortcuts</Text> app ➔ Go to the <Text className="font-bold">Automation</Text> tab ➔ Tap <Text className="font-bold">+</Text> ➔ Select <Text className="font-bold">Message</Text> as trigger. Set the Sender to your MoMo sender (e.g., <Text className="font-mono">MobileMoney</Text> or <Text className="font-mono">TelecelCash</Text>). Choose <Text className="font-bold">Run Immediately</Text> to sync in the background.
                      </Text>
                      <TouchableOpacity
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          Linking.openURL('shortcuts://').catch(() => {
                            Alert.alert('Error', 'Could not open Apple Shortcuts app. Please ensure it is installed.');
                          });
                        }}
                        className="bg-primary/10 mt-3 py-3 px-4 rounded-xl flex-row items-center justify-center self-start"
                      >
                        <Text className="text-primary font-bold text-xs mr-2">Open Shortcuts App</Text>
                        <ExternalLink size={14} color="#0A6E4A" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Step 2 */}
                  <View className="flex-row items-start mt-6">
                    <View className="w-6 h-6 rounded-full bg-primary/20 items-center justify-center mr-3 mt-0.5">
                      <Text className="text-primary font-bold text-xs">2</Text>
                    </View>
                    <View className="flex-1">
                      <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>Copy Webhook Destination URL</Text>
                      <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-1 leading-relaxed`}>
                        Under automation actions, add a <Text className="font-bold">Get Contents of URL</Text> action. Expand details, change method to <Text className="font-bold">POST</Text>, and paste the webhook URL:
                      </Text>
                      
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            const apiUrl = apiClient.defaults.baseURL || 'https://api.cedismart.com/api/v1';
                            const webhookUrl = `${apiUrl}/transactions/sms-webhook`;
                            Clipboard.setString(webhookUrl);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                            Alert.alert('URL Copied', 'The webhook URL has been copied to your clipboard!');
                          } catch (e) {
                            Alert.alert('Error', 'Failed to copy URL.');
                          }
                        }}
                        className={`mt-3 p-3.5 rounded-xl border flex-row justify-between items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-gray-50 border-gray-100'}`}
                      >
                        <Text className={`font-mono text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} flex-1`} numberOfLines={1}>
                          {`${apiClient.defaults.baseURL || 'https://api.cedismart.com/api/v1'}/transactions/sms-webhook`}
                        </Text>
                        <Copy size={16} color="#0A6E4A" className="ml-2" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Step 3 */}
                  <View className="flex-row items-start mt-6">
                    <View className="w-6 h-6 rounded-full bg-primary/20 items-center justify-center mr-3 mt-0.5">
                      <Text className="text-primary font-bold text-xs">3</Text>
                    </View>
                    <View className="flex-1">
                      <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>Copy Authentication Key</Text>
                      <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-1 leading-relaxed`}>
                        In the headers section of the action, add a header:
                        {"\n"}• Key: <Text className="font-mono font-bold">Authorization</Text>
                        {"\n"}• Value: <Text className="font-mono font-bold">Bearer &lt;your key&gt;</Text>
                      </Text>
                      
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            const token = await SecureStore.getItemAsync('access_token');
                            if (token) {
                              Clipboard.setString(token);
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                              Alert.alert('Key Copied', 'Your secure authentication key has been copied to your clipboard!');
                            } else {
                              Alert.alert('Session Expired', 'Please re-login to retrieve your auth key.');
                            }
                          } catch (e) {
                            Alert.alert('Error', 'Failed to retrieve auth token.');
                          }
                        }}
                        className={`mt-3 p-3.5 rounded-xl border flex-row justify-between items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-gray-50 border-gray-100'}`}
                      >
                        <Text className={`font-mono text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} flex-1`} numberOfLines={1}>
                          ••••••••••••••••••••••••••••••••
                        </Text>
                        <Copy size={16} color="#0A6E4A" className="ml-2" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Step 4 */}
                  <View className="flex-row items-start mt-6">
                    <View className="w-6 h-6 rounded-full bg-primary/20 items-center justify-center mr-3 mt-0.5">
                      <Text className="text-primary font-bold text-xs">4</Text>
                    </View>
                    <View className="flex-1">
                      <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>Configure JSON Payload</Text>
                      <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-1 leading-relaxed`}>
                        Change the Request Body to <Text className="font-bold">JSON</Text> and add these fields:
                        {"\n"}• <Text className="font-mono font-bold">sender</Text> ➔ Select <Text className="font-bold">Sender</Text> (from message variable)
                        {"\n"}• <Text className="font-mono font-bold">message_body</Text> ➔ Select <Text className="font-bold">Message</Text> or <Text className="font-bold">Shortcut Input</Text>
                        {"\n"}• <Text className="font-mono font-bold">phone</Text> ➔ Type your registered number: <Text className="font-mono font-bold">{user?.phone || 'your phone number'}</Text>
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                // --- Android Native Receiver ---
                <View className="space-y-6">
                  <View className={`p-4 rounded-2xl flex-row ${isDark ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-100'}`}>
                    <Info size={18} color="#10B981" className="mr-3 mt-0.5" />
                    <Text className={`flex-1 font-body text-xs leading-5 ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                      Android supports background message interception. Granting SMS permissions allows CediSmart to read and automatically log incoming MTN MoMo or Telecel Cash messages instantly.
                    </Text>
                  </View>

                  <View className="items-center py-6">
                    <Smartphone size={60} color="#10B981" />
                    <Text className={`font-headline font-black text-base mt-4 ${isDark ? 'text-white' : 'text-charcoal'}`}>
                      Automated Background Listening
                    </Text>
                    <Text className={`text-xs text-center mt-1 px-4 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Once enabled, transaction notifications will appear instantly when you receive a Mobile Money alert SMS.
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      try {
                        const granted = await PermissionsAndroid.requestMultiple([
                          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
                          PermissionsAndroid.PERMISSIONS.READ_SMS,
                        ]);
                        if (
                          granted['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED &&
                          granted['android.permission.READ_SMS'] === PermissionsAndroid.RESULTS.GRANTED
                        ) {
                          Alert.alert('Permission Granted', 'CediSmart is now configured to auto-log your MoMo messages in the background!');
                          setShowSyncModal(false);
                        } else {
                          Alert.alert('Permission Denied', 'Please grant SMS permissions in settings to enable automated background sync.');
                        }
                      } catch (err) {
                        Alert.alert('Error', 'Failed to request permissions.');
                      }
                    }}
                    className="w-full py-4 bg-primary rounded-xl items-center justify-center shadow-lg shadow-primary/30 active:scale-[0.98]"
                  >
                    <Text className="text-white font-bold text-base">Grant SMS Permissions</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default AccountsScreen;
