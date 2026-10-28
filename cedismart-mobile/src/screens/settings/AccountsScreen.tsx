import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { GlassSheetBackground } from '../../components/glass/GlassSheetBackground';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassSurface } from '../../components/glass/GlassSurface';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView, Modal, RefreshControl, Platform, PermissionsAndroid, Clipboard, Linking, NativeModules, Image, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import BottomSheet from '../../components/shared/AppBottomSheet';
import { ArrowLeft, Landmark, Wallet, Smartphone, Trash2, ChevronRight, Shield, Eye, EyeOff, Zap, CheckCircle2, Info, ExternalLink, Copy, Headphones } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { SupportModal } from '../../components/shared/SupportModal';
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

const maskPhone = (phone?: string) => {
  if (!phone) return 'your phone number';
  const val = phone.trim();
  if (val.length <= 8) return val;
  return `${val.slice(0, 6)}****${val.slice(-3)}`;
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
  const [isSupportModalVisible, setIsSupportModalVisible] = useState(false);
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

  // Account Form State
  const [linkingType, setLinkingType] = useState<'momo' | 'bank' | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
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

  // Mutation to save/update physical cash amount (reconciles current balance accurately)
  const saveCashMutation = useMutation({
    mutationFn: async (amount: number) => {
      if (cashAccount) {
        return apiClient.patch(`/accounts/${cashAccount.id}`, {
          reconcile_to_balance: amount
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
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      Alert.alert('Success', 'Physical cash balance updated!');
      cashSheetRef.current?.close();
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.error?.message || 'Failed to update cash balance.');
    }
  });

  // Mutation to add a MoMo or Bank account
  const createMutation = useMutation({
    mutationFn: (newAccount: any) => apiClient.post('/accounts/', newAccount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      Alert.alert('Account Added', 'Your account is now being tracked.');
      bottomSheetRef.current?.close();
      setIdentifier('');
      setStartingBalance('');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to add account.');
    }
  });

  // Mutation to delete/disconnect account
  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => apiClient.delete(`/accounts/${accountId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      Alert.alert('Account Removed', 'Account removed from tracking.');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to remove account.');
    }
  });

  const handleLink = () => {
    let cleanId = identifier.trim().replace(/\s+/g, '');

    if (linkingType === 'momo' && cleanId) {
      if (/^\d{9}$/.test(cleanId) && !cleanId.startsWith('0')) {
        cleanId = `0${cleanId}`;
      }
      const phoneRegex = /^0\d{9}$/;
      if (!phoneRegex.test(cleanId)) {
        Alert.alert('Invalid Number', 'Please enter a valid 10-digit Ghana phone number (e.g. 0241234567) or leave it blank.');
        return;
      }

      const prefix = cleanId.substring(0, 3);
      if (selectedProvider === 'MTN MoMo') {
        const mtnPrefixes = ['024', '054', '055', '059', '025', '053'];
        if (!mtnPrefixes.includes(prefix)) {
          Alert.alert(
            'Check Operator Prefix',
            `The number prefix (${prefix}) does not match MTN MoMo (${mtnPrefixes.join(', ')}).`
          );
          return;
        }
      } else if (selectedProvider === 'Telecel Cash') {
        const telecelPrefixes = ['020', '050'];
        if (!telecelPrefixes.includes(prefix)) {
          Alert.alert(
            'Check Operator Prefix',
            `The number prefix (${prefix}) does not match Telecel Cash (${telecelPrefixes.join(', ')}).`
          );
          return;
        }
      } else if (selectedProvider === 'AirtelTigo Money') {
        const atPrefixes = ['026', '056', '027', '057'];
        if (!atPrefixes.includes(prefix)) {
          Alert.alert(
            'Check Operator Prefix',
            `The number prefix (${prefix}) does not match AirtelTigo Money (${atPrefixes.join(', ')}).`
          );
          return;
        }
      }
    }

    const rawBal = startingBalance.trim() === '' ? '0' : startingBalance.trim();
    const parsedBalance = parseFloat(rawBal);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      Alert.alert('Invalid Balance', 'Please enter a valid starting balance (0 or more).');
      return;
    }

    createMutation.mutate({
      name: linkingType === 'momo' ? `${selectedProvider} Wallet` : `${selectedProvider} Account`,
      account_type: linkingType === 'momo' ? 'mobile_money' : 'bank',
      provider: selectedProvider,
      account_number: cleanId || undefined,
      opening_balance: parsedBalance
    });
  };

  const confirmDisconnect = (accountId: string, accountName: string) => {
    Alert.alert(
      'Remove Account?',
      `Are you sure you want to remove ${accountName} from your tracked accounts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive', 
          onPress: () => deleteMutation.mutate(accountId) 
        }
      ]
    );
  };

  const openLinkSheet = (type: 'momo' | 'bank') => {
    setLinkingType(type);
    if (type === 'momo') {
      setSelectedProvider('MTN MoMo');
    } else {
      setSelectedProvider('GCB Bank');
    }
    setStartingBalance('');
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <GlassButton accessibilityLabel="Back to dashboard" onPress={() => navigation.goBack()}>
            <ArrowLeft size={22} color={isDark ? '#a4f3b9' : '#0d631b'} />
          </GlassButton>
          <Text className={`text-3xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`} style={{ flex: 1 }}>My Accounts</Text>
          <GlassButton accessibilityLabel="Accounts AI Support" onPress={() => setIsSupportModalVisible(true)}>
            <Headphones size={19} color={isDark ? '#4ade80' : '#0d631b'} />
          </GlassButton>
        </View>
        <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} mb-8`}>Add/Track your sources of Income.</Text>

        {/* Total net worth */}
        {/* Total Tracked Balance */}
        <GlassSurface tint="emerald" elevated radius={28} style={{ marginBottom: 32, backgroundColor: 'rgba(14, 42, 20, 0.82)' }}>
          <View className="relative overflow-hidden p-6">
            <View className="absolute top-0 right-0 opacity-10 translate-x-4 -translate-y-4">
              <Landmark size={150} color="white" strokeWidth={1} />
            </View>
            <View className="relative z-10">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Total Tracked Balance</Text>
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
              <Text className="text-white/60 text-[11px] mt-1">
                Based on starting balances & recorded transactions
              </Text>
            </View>
          </View>
        </GlassSurface>

        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-8" />
        ) : (
          <View className="space-y-6 mb-12">
            {/* SOURCE CARDS */}
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest ml-1 mb-2`}>Add or Update Accounts</Text>

            {/* Unified Action Card */}
            <View
              style={[
                styles.sourceActionGroup,
                {
                  backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : 'rgba(255, 255, 255, 0.96)',
                  borderColor: isDark ? 'rgba(164, 243, 185, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              {/* MoMo Row */}
              <TouchableOpacity 
                onPress={() => openLinkSheet('momo')}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 16, width: '100%' }}
              >
                <View className={`w-11 h-11 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center`} style={{ marginRight: 14, flexShrink: 0 }}>
                  <Smartphone size={22} color={isDark ? '#4ade80' : '#0A6E4A'} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className={`font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base`}>Add MoMo Wallet</Text>
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-0.5`}>Track MTN, Telecel, or AirtelTigo spending</Text>
                </View>
                {isMomoLinked ? (
                  <Text className="text-success font-bold text-xs" style={{ marginLeft: 8, flexShrink: 0 }}>ADDED</Text>
                ) : (
                  <ChevronRight size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
                )}
              </TouchableOpacity>

              <View
                style={{
                  height: StyleSheet.hairlineWidth || 1,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  marginLeft: 70,
                }}
              />

              {/* Bank Row */}
              <TouchableOpacity 
                onPress={() => openLinkSheet('bank')}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 16, width: '100%' }}
              >
                <View className={`w-11 h-11 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center`} style={{ marginRight: 14, flexShrink: 0 }}>
                  <Landmark size={22} color={isDark ? '#4ade80' : '#0A6E4A'} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className={`font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base`}>Add Bank Account</Text>
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mt-0.5`}>Track your local Ghanaian bank balance</Text>
                </View>
                {isBankLinked ? (
                  <Text className="text-success font-bold text-xs" style={{ marginLeft: 8, flexShrink: 0 }}>ADDED</Text>
                ) : (
                  <ChevronRight size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
                )}
              </TouchableOpacity>

              <View
                style={{
                  height: StyleSheet.hairlineWidth || 1,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  marginLeft: 70,
                }}
              />

              {/* Physical Cash Row */}
              <TouchableOpacity 
                onPress={() => {
                  setCashInput(cashAccount ? parseFloat(cashAccount.balance).toString() : '0.00');
                  cashSheetRef.current?.snapToIndex(0);
                }}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 16, width: '100%' }}
              >
                <View className={`w-11 h-11 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center`} style={{ marginRight: 14, flexShrink: 0 }}>
                  <Wallet size={22} color={isDark ? '#4ade80' : '#0A6E4A'} />
                </View>
                <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <Text
                    className={`font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-[15px]`}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    Physical Cash
                  </Text>
                  <Text
                    className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-[11px] mt-0.5`}
                    numberOfLines={1}
                  >
                    Tap to update cash in hand
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6, flexShrink: 0 }}>
                  <Text className={`font-bold text-[15px] ${isDark ? 'text-[#4ade80]' : 'text-primary'}`} numberOfLines={1}>
                    {hiddenAccounts['cash'] ? "₵ ••••" : (cashAccount ? formatGHS(cashAccount.balance) : '₵0.00')}
                  </Text>
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); toggleAccountVisibility('cash'); }}
                    style={{ marginLeft: 6 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {hiddenAccounts['cash'] ? (
                      <EyeOff size={14} color={isDark ? '#4ade80' : '#0A6E4A'} />
                    ) : (
                      <Eye size={14} color={isDark ? '#4ade80' : '#0A6E4A'} />
                    )}
                  </TouchableOpacity>
                </View>
                <ChevronRight size={18} color={isDark ? '#6B7280' : '#9CA3AF'} />
              </TouchableOpacity>
            </View>

            {/* ACTIVE SOURCES LIST */}
            {filteredLinkedAccounts.length > 0 && (
              <View className="mt-4">
                <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest ml-1 mb-4`}>Tracked Wallets & Accounts</Text>
                {filteredLinkedAccounts.map((item) => {
                  const card = (() => {
                    switch (item.provider) {
                      case 'MTN MoMo':
                        return {
                          bg: 'bg-amber-400 border-amber-500/20',
                          text: 'text-black',
                          sub: 'text-black/65',
                          logo: 'MTN MoMo',
                          chip: 'bg-black/80',
                          accentColor: '#000000',
                        };
                      case 'Telecel Cash':
                        return {
                          bg: 'bg-red-600 border-red-400/30',
                          text: 'text-white',
                          sub: 'text-white/75',
                          logo: 'telecel cash',
                          chip: 'bg-amber-400/85',
                          accentColor: '#ffffff',
                        };
                      case 'AirtelTigo Money':
                      case 'AirtelTigo':
                        return {
                          bg: 'bg-blue-600 border-blue-400/30',
                          text: 'text-white',
                          sub: 'text-white/75',
                          logo: 'at money',
                          chip: 'bg-amber-400/85',
                          accentColor: '#ffffff',
                        };
                      case 'GCB Bank':
                        return {
                          bg: 'bg-emerald-800 border-emerald-600/30',
                          text: 'text-amber-100',
                          sub: 'text-white/75',
                          logo: 'GCB Bank',
                          chip: 'bg-amber-400/85',
                          accentColor: '#FFF8E7',
                        };
                      case 'Ecobank':
                        return {
                          bg: 'bg-cyan-700 border-cyan-500/30',
                          text: 'text-white',
                          sub: 'text-white/75',
                          logo: 'Ecobank',
                          chip: 'bg-amber-400/85',
                          accentColor: '#ffffff',
                        };
                      case 'Stanbic Bank':
                        return {
                          bg: 'bg-blue-800 border-blue-600/30',
                          text: 'text-white',
                          sub: 'text-white/75',
                          logo: 'Stanbic Bank',
                          chip: 'bg-amber-400/85',
                          accentColor: '#ffffff',
                        };
                      case 'ABSA Bank':
                        return {
                          bg: 'bg-rose-950 border-rose-700/30',
                          text: 'text-rose-100',
                          sub: 'text-rose-200',
                          logo: 'absa',
                          chip: 'bg-amber-400/85',
                          accentColor: '#ffe4e6',
                        };
                      default:
                        return {
                          bg: isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-[#eef5f0] border-gray-100',
                          text: isDark ? 'text-white' : 'text-charcoal',
                          sub: isDark ? 'text-gray-400' : 'text-gray-500',
                          logo: item.provider || 'Account',
                          chip: isDark ? 'bg-white/10' : 'bg-[#0d631b]/10',
                          accentColor: isDark ? '#4ade80' : '#0A6E4A',
                        };
                    }
                  })();

                  // Clean numeric mask (never show raw UUID hex characters like "bcbb")
                  const maskedDigits = (() => {
                    if (item.account_number) {
                      const clean = item.account_number.trim();
                      return item.account_type === 'mobile_money'
                        ? `${clean.slice(0, 3)} ••• ${clean.slice(-2)}`
                        : `•••• •••• ${clean.slice(-4)}`;
                    }
                    if (item.account_type === 'mobile_money' && user?.phone) {
                      const localPhone = user.phone.replace(/^\+?233/, '0').replace(/\D/g, '');
                      if (localPhone.length >= 6) {
                        return `${localPhone.slice(0, 3)} ••• ${localPhone.slice(-2)}`;
                      }
                    }
                    const numericFallback = (item.id.replace(/\D/g, '') + '4829').slice(0, 4);
                    return `•••• •••• ${numericFallback}`;
                  })();

                  return (
                    <View 
                      key={item.id} 
                      className={`relative overflow-hidden w-full rounded-3xl p-6 mb-6 border shadow-lg ${card.bg}`}
                      style={{ minHeight: 184, justifyContent: 'space-between' }}
                    >
                      {/* Visual Shimmer Watermarks */}
                      <View className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full translate-x-8 -translate-y-8" />
                      <View className="absolute bottom-0 right-0 w-24 h-24 bg-white/10 rounded-full translate-x-4 translate-y-4" />

                      {/* Upper Card Row */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', zIndex: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 12 }}>
                          {renderProviderLogo(item.provider, isDark)}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text className={`font-headline font-black text-sm tracking-wide uppercase ${card.text}`} numberOfLines={1}>
                              {card.logo}
                            </Text>
                            <Text className={`font-body text-[9px] uppercase font-bold tracking-widest ${card.sub}`} numberOfLines={1}>
                              {item.account_type === 'mobile_money' ? 'MOBILE MONEY' : 'BANK ACCOUNT'}
                            </Text>
                          </View>
                        </View>
                        
                        <TouchableOpacity 
                          onPress={() => confirmDisconnect(item.id, item.name)}
                          className={`p-2.5 rounded-full ${item.provider === 'MTN MoMo' ? 'bg-black/10' : 'bg-white/15'} active:scale-95`}
                          style={{ flexShrink: 0 }}
                        >
                          <Trash2 size={18} color={card.accentColor} />
                        </TouchableOpacity>
                      </View>

                      {/* Middle Card Row: Chip & Balance */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 18, zIndex: 10 }}>
                        {/* Chip Graphic */}
                        <View className={`w-9 h-7 rounded-md ${card.chip} border ${item.provider === 'MTN MoMo' ? 'border-black/20' : 'border-white/25'} flex-row flex-wrap p-1`} style={{ flexShrink: 0 }}>
                          <View className="w-full h-[1px] bg-white/25 mb-1" />
                          <View className="w-1/2 h-2 bg-white/25 mr-1" />
                          <View className="w-1/3 h-2 bg-white/25" />
                        </View>

                        {/* Balance */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginLeft: 12 }}>
                          <Text
                            className={`font-headline font-black text-2xl tracking-tight ${card.text}`}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                          >
                            {hiddenAccounts[item.id] ? "₵ ••••" : formatGHS(item.balance)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => toggleAccountVisibility(item.id)}
                            style={{ marginLeft: 8 }}
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

                      {/* Bottom Card Row — Properly constrained so number & holder name never collide or overflow */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', zIndex: 10 }}>
                        <Text
                          className={`font-body text-xs font-semibold tracking-wider ${card.sub}`}
                          style={{ flexShrink: 0, marginRight: 12 }}
                          numberOfLines={1}
                        >
                          {maskedDigits}
                        </Text>
                        <Text
                          className={`font-headline font-black text-[10px] tracking-wider ${card.sub} uppercase`}
                          style={{ flex: 1, minWidth: 0, textAlign: 'right' }}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {user?.full_name || 'HOLDER'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                
                {accounts?.some((acc: any) => acc.account_type === 'mobile_money') && (
                  <GlassSurface solidFallback radius={26} elevated style={{ marginTop: 8, marginBottom: 24 }}>
                    <View style={{ padding: 20, width: '100%' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, width: '100%' }}>
                        <View
                          className={`p-2.5 rounded-xl ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}
                          style={{ marginRight: 12, flexShrink: 0 }}
                        >
                          <Zap size={20} color="#10B981" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            className={`font-headline font-black text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}
                            numberOfLines={1}
                          >
                            ⚡ Mobile Money SMS Auto-Sync
                          </Text>
                          <Text
                            className={`font-body text-[11px] mt-0.5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
                            numberOfLines={2}
                          >
                            Auto-log transactions from SMS alerts
                          </Text>
                        </View>
                      </View>
                      <Text className={`font-body text-xs leading-5 mb-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        Keep your wallet records updated automatically when you receive MoMo SMS alerts.
                      </Text>
                      <TouchableOpacity 
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setShowSyncModal(true);
                        }}
                        className="bg-primary py-3.5 px-4 rounded-2xl items-center justify-center active:opacity-90"
                        style={{ width: '100%' }}
                      >
                        <Text
                          className="text-white font-bold text-xs text-center"
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.85}
                        >
                          Configure SMS Auto-Sync (iOS / Android)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </GlassSurface>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Generic Add Account Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['85%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-5 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                {linkingType === 'momo' ? 'Add MoMo Wallet' : 'Add Bank Account'}
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
                  {linkingType === 'momo' ? 'Wallet Phone Number (Optional)' : 'Account Number (Optional)'}
                </Text>
                <TextInput
                  className={`${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 text-dark-charcoal' : 'bg-white border-gray-100 text-charcoal'} px-4 py-4 rounded-xl border text-base shadow-sm`}
                  placeholder={linkingType === 'momo' ? 'e.g. 024 123 4567' : 'e.g. 104101002345'}
                  placeholderTextColor={isDark ? '#4b5563' : '#D1D5DB'}
                  keyboardType={linkingType === 'momo' ? 'phone-pad' : 'number-pad'}
                  value={identifier}
                  onChangeText={setIdentifier}
                />
              </View>

              <View>
                <Text className={`text-xs font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-1 ml-1`}>Current / Starting Balance (₵)</Text>
                <Text className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2 ml-1`}>
                  Enter how much is currently in this account so CediSmart can track changes as you log transactions.
                </Text>
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
                  {createMutation.isPending ? 'Saving Account...' : `Save ${linkingType === 'momo' ? 'MoMo Wallet' : 'Bank Account'}`}
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
        backgroundComponent={GlassSheetBackground}
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
          <GlassSurface
            variant="thick"
            elevated
            radius={32}
            style={{ width: '100%', maxHeight: '86%', padding: 24, paddingBottom: 40 }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, width: '100%' }}>
              <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                <Text
                  className={`font-headline font-black text-lg ${isDark ? 'text-white' : 'text-charcoal'}`}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  ⚡ Mobile Money Auto-Sync
                </Text>
                <Text
                  className={`font-body text-[11px] mt-0.5 ${isDark ? 'text-gray-300' : 'text-gray-500'}`}
                  numberOfLines={1}
                >
                  Real-time transaction tracking setup
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => setShowSyncModal(false)}
                className={`${isDark ? 'bg-primary/25 border border-primary/40' : 'bg-primary/10'} px-4 py-2 rounded-full active:scale-95`}
                style={{ flexShrink: 0 }}
              >
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-xs`}>Done</Text>
              </TouchableOpacity>
            </View>

            {!(user?.is_premium || user?.is_trial_active) ? (
              <View className="items-center py-10 px-4">
                <View className={`w-16 h-16 rounded-full ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center mb-4`}>
                  <Smartphone size={32} color={isDark ? '#4ade80' : '#16a34a'} />
                </View>
                <Text className={`font-headline font-bold text-lg text-center ${isDark ? 'text-white' : 'text-charcoal'}`}>
                  Auto-Sync is a Pro Feature
                </Text>
                <Text className={`text-xs text-center mt-2 leading-relaxed max-w-[280px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  SMS background listening and automated webhooks require an active subscription or free trial.
                </Text>
                
                <TouchableOpacity
                  onPress={() => {
                    setShowSyncModal(false);
                    Alert.alert(
                      'Unlock Pro Features',
                      'Please visit the Settings menu to redeem your 7-day Free Trial or subscribe to a plan!',
                      [{ text: 'OK' }]
                    );
                  }}
                  className="mt-6 w-full bg-primary h-12 rounded-xl items-center justify-center shadow-lg shadow-primary/20"
                >
                  <Text className="text-white font-headline font-bold text-sm">
                    Unlock Premium Features
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
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
                        <View className={`w-6 h-6 rounded-full ${isDark ? 'bg-primary/30' : 'bg-primary/20'} items-center justify-center mr-3 mt-0.5`}>
                          <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-xs`}>1</Text>
                        </View>
                        <View className="flex-1">
                          <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>Configure Automation Trigger</Text>
                          <Text className={`${isDark ? 'text-gray-300' : 'text-gray-500'} text-xs mt-1 leading-relaxed`}>
                            Open the native Apple <Text className="font-bold">Shortcuts</Text> app ➔ Go to the <Text className="font-bold">Automation</Text> tab ➔ Tap <Text className="font-bold">+</Text> ➔ Select <Text className="font-bold">Message</Text> as trigger. Set the Sender to your MoMo sender (e.g., <Text className="font-mono">MobileMoney</Text> or <Text className="font-mono">T-CASH</Text>). Choose <Text className="font-bold">Run Immediately</Text> to sync in the background.
                          </Text>
                          <TouchableOpacity
                            onPress={async () => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                              Linking.openURL('shortcuts://').catch(() => {
                                Alert.alert('Error', 'Could not open Apple Shortcuts app. Please ensure it is installed.');
                              });
                            }}
                            className={`${isDark ? 'bg-primary/25 border border-primary/40' : 'bg-primary/10'} mt-3 py-3 px-4 rounded-xl flex-row items-center justify-center self-start`}
                          >
                            <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-xs mr-2`}>Open Shortcuts App</Text>
                            <ExternalLink size={14} color={isDark ? '#4ade80' : '#0A6E4A'} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Step 2 */}
                      <View className="flex-row items-start mt-6">
                        <View className={`w-6 h-6 rounded-full ${isDark ? 'bg-primary/30' : 'bg-primary/20'} items-center justify-center mr-3 mt-0.5`}>
                          <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-xs`}>2</Text>
                        </View>
                        <View className="flex-1">
                          <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>Add Contents URL Action</Text>
                          <Text className={`${isDark ? 'text-gray-300' : 'text-gray-500'} text-xs mt-1 leading-relaxed`}>
                            Add the <Text className="font-bold">Get Contents of URL</Text> action. Set the URL to:
                          </Text>
                          <View className={`mt-3 p-3.5 rounded-xl border flex-row justify-between items-center ${isDark ? 'bg-black/25 border-white/15' : 'bg-gray-50 border-gray-100'}`}>
                            <Text className={`font-mono text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'} flex-1`} numberOfLines={1}>
                              https://api.cedismart.com/api/v1/transactions/sms-webhook
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                Clipboard.setString('https://api.cedismart.com/api/v1/transactions/sms-webhook');
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                                Alert.alert('Copied', 'Webhook URL copied to clipboard!');
                              }}
                              className="ml-2"
                            >
                              <Copy size={16} color={isDark ? '#4ade80' : '#0A6E4A'} />
                            </TouchableOpacity>
                          </View>
                          <Text className={`${isDark ? 'text-gray-400' : 'text-gray-400'} text-[10px] mt-1`}>
                            Tap the URL in Shortcuts to change the method from GET to <Text className="font-bold">POST</Text>.
                          </Text>
                        </View>
                      </View>

                      {/* Step 3 */}
                      <View className="flex-row items-start mt-6">
                        <View className={`w-6 h-6 rounded-full ${isDark ? 'bg-primary/30' : 'bg-primary/20'} items-center justify-center mr-3 mt-0.5`}>
                          <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-xs`}>3</Text>
                        </View>
                        <View className="flex-1">
                          <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>Copy Authentication Key</Text>
                          <Text className={`${isDark ? 'text-gray-300' : 'text-gray-500'} text-xs mt-1 leading-relaxed`}>
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
                            className={`mt-3 p-3.5 rounded-xl border flex-row justify-between items-center ${isDark ? 'bg-black/25 border-white/15' : 'bg-gray-50 border-gray-100'}`}
                          >
                            <Text className={`font-mono text-xs ${isDark ? 'text-gray-300' : 'text-gray-500'} flex-1`} numberOfLines={1}>
                              ••••••••••••••••••••••••••••••••
                            </Text>
                            <Copy size={16} color={isDark ? '#4ade80' : '#0A6E4A'} className="ml-2" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Step 4 */}
                      <View className="flex-row items-start mt-6">
                        <View className={`w-6 h-6 rounded-full ${isDark ? 'bg-primary/30' : 'bg-primary/20'} items-center justify-center mr-3 mt-0.5`}>
                          <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-xs`}>4</Text>
                        </View>
                        <View className="flex-1">
                          <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>Configure JSON Payload</Text>
                          <Text className={`${isDark ? 'text-gray-300' : 'text-gray-500'} text-xs mt-1 leading-relaxed`}>
                            Change the Request Body to <Text className="font-bold">JSON</Text> and add these fields:
                            {"\n"}• <Text className="font-mono font-bold">sender</Text> ➔ Select <Text className="font-bold">Sender</Text> (from message variable)
                            {"\n"}• <Text className="font-mono font-bold">message_body</Text> ➔ Select <Text className="font-bold">Message</Text> or <Text className="font-bold">Shortcut Input</Text>
                            {"\n"}• <Text className="font-mono font-bold">phone</Text> ➔ Type your registered number (e.g., <Text className="font-mono font-bold">+23324****567</Text>)
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
              </>
            )}
          </GlassSurface>
        </View>
      </Modal>

      {/* AI Support Modal */}
      <SupportModal
        visible={isSupportModalVisible}
        onClose={() => setIsSupportModalVisible(false)}
        phone={user?.phone}
        userName={user?.full_name}
        screenContext="settings"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  sourceActionGroup: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
});

export default AccountsScreen;
