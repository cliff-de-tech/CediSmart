import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, ScrollView, Image, Dimensions, Linking, Alert, TextInput, Modal, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { formatGHS } from '../../utils/currency';
import { Plus, Tag, ArrowRight, Bell, Menu, Landmark, PieChart as PieIcon, Smartphone, ShieldCheck, Award, Search, Sparkles, Trash2, Users, SlidersHorizontal, Eye, EyeOff } from 'lucide-react-native';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useQuery } from '@tanstack/react-query';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import PINPad from '../../components/shared/PINPad';
import apiClient, { setActiveTokens, clearActiveSession } from '../../api/client';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { ConfettiEffect } from '../../components/shared/ConfettiEffect';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const DEFAULT_AVATAR_URL = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCPbtwyh4Eo_96C5zd6dFJFY9kbHP067jJpa7Aayw3aUk1co9x1_rJZOkN1473J1n10wGOmZyH_imPk56BMFUhtqh97n0NlHcDadkkvYPKlykD_wgKQ0fNUrBK4Iu1lJLUicP3eclDQXCGAAWUx5hODGPkFmHdt7ak3QMG9zCIQ1woeQWjZ7lpo8WpbJ3fIQepJ_Q7ZT7r1xyJBsDS0TdhOmQJP54CdoizSC8UpE8ln59Y5-6_lJNv8GhvkiAlc4Ddi9D8xyhpQ_YM';

interface Transaction {
  id: string;
  amount: string;
  transaction_type: 'income' | 'expense' | 'transfer';
  description: string | null;
  transaction_date: string;
  category: {
    name: string;
    icon: string | null;
    color: string | null;
  };
}

interface Budget {
  id: string;
  budgeted_amount: string;
  spent_amount: string;
  percentage_used: number;
  category: {
    name: string;
    color: string | null;
  };
}

const DashboardScreen = ({ navigation }: any) => {
  const { user, logout, savedAccounts, loadSavedAccounts, removeSavedAccount, login } = useAuthStore();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const { pendingCount } = useOfflineSync();
  const [showConfetti, setShowConfetti] = useState(false);
  const prevPendingCount = useRef(pendingCount);
  const ussdSheetRef = useRef<BottomSheet>(null);
  const profileSheetRef = useRef<BottomSheet>(null);
  const ledgerSheetRef = useRef<BottomSheet>(null);

  const [avatarUri, setAvatarUri] = useState<string>(DEFAULT_AVATAR_URL);
  const [isViewingPhoto, setIsViewingPhoto] = useState(false);
  const [isKycVerified, setIsKycVerified] = useState(false);

  // Multi-Account Switcher state
  const [isSwitchingModalVisible, setIsSwitchingModalVisible] = useState(false);
  const [switchingTarget, setSwitchingTarget] = useState<any>(null);
  const [switchPin, setSwitchPin] = useState('');
  const [switchError, setSwitchError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | null>(null);
  const [accountAvatars, setAccountAvatars] = useState<Record<string, string>>({});
  const [hideBalances, setHideBalances] = useState(false);

  useEffect(() => {
    if (user?.id) {
      AsyncStorage.getItem(`hide_balances_${user.id}`).then((val) => {
        setHideBalances(val === 'true');
      });
    }
  }, [user?.id]);

  const toggleHideBalances = async () => {
    if (user?.id) {
      const newVal = !hideBalances;
      setHideBalances(newVal);
      await AsyncStorage.setItem(`hide_balances_${user.id}`, newVal ? 'true' : 'false');
      Haptics.selectionAsync().catch(() => {});
    }
  };

  // Ledger Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterAccount, setFilterAccount] = useState<string | null>(null);
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');

  const { data: categories } = useQuery<any[]>({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/categories/');
      return response.data;
    },
    enabled: !!user?.id
  });

  const { data: accounts, isLoading: isAccountsLoading, refetch: refetchAccounts } = useQuery<any[]>({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/accounts/');
      return response.data;
    },
    enabled: !!user?.id
  });

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['transactions', 'summary', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/transactions/summary');
      return response.data;
    },
    enabled: !!user?.id
  });

  const { data: transactionsData, isLoading: isTransactionsLoading, refetch: refetchTransactions } = useQuery({
    queryKey: ['transactions', 'recent', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/transactions/?per_page=5');
      return response.data;
    },
    enabled: !!user?.id
  });

  const { data: budgets, refetch: refetchBudgets } = useQuery<Budget[]>({
    queryKey: ['budgets', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/budgets/');
      return response.data;
    },
    enabled: !!user?.id
  });

  const { data: allTransactionsData, isLoading: isAllTransactionsLoading, refetch: refetchAllTransactions } = useQuery({
    queryKey: ['transactions', 'all', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/transactions/');
      return response.data;
    },
    enabled: !!user?.id
  });
  const allTransactions = allTransactionsData?.data || [];

  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((tx: any) => {
      const matchesSearch = 
        !searchQuery.trim() || 
        tx.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.category?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.amount?.toString().includes(searchQuery) ||
        tx.account?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        
      const matchesType = 
        filterType === 'all' || 
        tx.transaction_type === filterType;

      const matchesCategory = 
        !filterCategory || 
        tx.category?.id === filterCategory;

      const matchesAccount = 
        !filterAccount || 
        tx.account?.id === filterAccount;

      const amountVal = parseFloat(tx.amount) || 0;
      const matchesMinAmount = !filterMinAmount.trim() || amountVal >= parseFloat(filterMinAmount);
      const matchesMaxAmount = !filterMaxAmount.trim() || amountVal <= parseFloat(filterMaxAmount);

      let matchesDate = true;
      if (filterDateRange !== 'all') {
        const txDate = new Date(tx.transaction_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (filterDateRange === 'today') {
          matchesDate = txDate >= today;
        } else if (filterDateRange === 'week') {
          const weekAgo = new Date();
          weekAgo.setDate(today.getDate() - 7);
          matchesDate = txDate >= weekAgo;
        } else if (filterDateRange === 'month') {
          const monthAgo = new Date();
          monthAgo.setMonth(today.getMonth() - 1);
          matchesDate = txDate >= monthAgo;
        } else if (filterDateRange === 'year') {
          const yearAgo = new Date();
          yearAgo.setFullYear(today.getFullYear() - 1);
          matchesDate = txDate >= yearAgo;
        }
      }
        
      return matchesSearch && matchesType && matchesCategory && matchesAccount && matchesMinAmount && matchesMaxAmount && matchesDate;
    });
  }, [allTransactions, searchQuery, filterType, filterCategory, filterAccount, filterMinAmount, filterMaxAmount, filterDateRange]);

  const totalNetWorth = useMemo(() => {
    if (!accounts) return 0;
    return accounts.reduce((acc, curr) => acc + parseFloat(curr.balance), 0);
  }, [accounts]);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchAccounts(),
        refetchSummary(),
        refetchTransactions(),
        refetchBudgets(),
        refetchAllTransactions(),
      ]);
    } catch (e) {
      console.error('Failed to manually refresh dashboard data:', e);
    } finally {
      setRefreshing(false);
    }
  }, [refetchAccounts, refetchSummary, refetchTransactions, refetchBudgets, refetchAllTransactions]);

  // Sync avatar, KYC status, and saved accounts when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadSavedAccounts();
      if (user?.id) {
        AsyncStorage.getItem(`user_avatar_${user.id}`).then((uri) => {
          if (uri) {
            setAvatarUri(uri);
          } else {
            setAvatarUri(DEFAULT_AVATAR_URL);
          }
        });
        AsyncStorage.getItem(`kyc_verified_${user.id}`).then((val) => {
          setIsKycVerified(val === 'true');
        });
        
        if (user?.has_premium_access) {
          AsyncStorage.getItem('pending_confetti').then((val) => {
            if (val === 'true') {
              setShowConfetti(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              AsyncStorage.removeItem('pending_confetti');
            }
          });
        }
      }
      // Load avatars for all saved accounts
      AsyncStorage.getItem('saved_accounts_list').then((listStr) => {
        const list = listStr ? JSON.parse(listStr) : [];
        const avatarMap: Record<string, string> = {};
        Promise.all(
          list.map(async (acc: any) => {
            if (acc.id) {
              const uri = await AsyncStorage.getItem(`user_avatar_${acc.id}`);
              if (uri) avatarMap[acc.phone] = uri;
            }
          })
        ).then(() => setAccountAvatars(avatarMap));
      });
    }, [user?.id, user?.has_premium_access, loadSavedAccounts])
  );

  // Trigger confetti and premium haptics when offline transactions are successfully synced in the background!
  useEffect(() => {
    if (user?.has_premium_access && prevPendingCount.current > 0 && pendingCount === 0) {
      setShowConfetti(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    prevPendingCount.current = pendingCount;
  }, [pendingCount, user?.has_premium_access]);

  // --- Account Switcher Logic ---
  const checkBiometricsForSwitch = async (targetPhone: string) => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('face');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('fingerprint');
        }
        
        const sanitized = targetPhone.replace(/[^\w.-]/g, '');
        const savedPin = await SecureStore.getItemAsync(`user_pin_${sanitized}`);
        if (savedPin) {
          setBiometricAvailable(true);
          return savedPin;
        }
      }
    } catch (e) {
      console.warn('Error checking biometrics for switch:', e);
    }
    setBiometricAvailable(false);
    setBiometricType(null);
    return null;
  };

  const startAccountSwitch = async (account: any) => {
    setSwitchPin('');
    setSwitchError('');
    setSwitchingTarget(account);
    
    const savedPin = await checkBiometricsForSwitch(account.phone);
    setIsSwitchingModalVisible(true);
    
    if (savedPin) {
      setTimeout(() => {
        triggerBiometricSwitch(account.phone, savedPin);
      }, 350);
    }
  };

  const triggerBiometricSwitch = async (targetPhone: string, savedPin: string) => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Verify identity to switch to ${targetPhone}`,
        fallbackLabel: 'Use PIN',
      });
      if (result.success) {
        await executeAccountSwitch(targetPhone, savedPin);
      }
    } catch (e) {
      console.warn('Biometric switch error:', e);
    }
  };

  const executeAccountSwitch = async (targetPhone: string, pin: string) => {
    try {
      const sanitized = targetPhone.replace(/[^\w.-]/g, '');
      let access = await SecureStore.getItemAsync(`session_access_token_${sanitized}`);
      let refresh = await SecureStore.getItemAsync(`session_refresh_token_${sanitized}`);
      
      if (!access || !refresh) {
        // Tokens expired or missing — re-authenticate via login API
        try {
          const loginResp = await apiClient.post('/auth/login', { phone: targetPhone, pin });
          const { access_token, refresh_token, user: userProfile } = loginResp.data;
          await setActiveTokens(targetPhone, access_token, refresh_token);
          
          login(userProfile);
          
          setIsSwitchingModalVisible(false);
          setSwitchingTarget(null);
          profileSheetRef.current?.close();
          
          await AsyncStorage.setItem('last_logged_in_phone', targetPhone);
          
          Alert.alert('Account Switched', `Welcome back, ${userProfile.full_name || 'user'}!`);
          return;
        } catch (loginErr: any) {
          console.error('Re-auth during switch failed:', loginErr?.response?.data || loginErr);
          setSwitchError('Session expired. Please log in again.');
          return;
        }
      }
      
      try {
        await setActiveTokens(targetPhone, access, refresh);
        const response = await apiClient.get('/users/me');
        const userProfile = response.data;
        
        login(userProfile);
        
        setIsSwitchingModalVisible(false);
        setSwitchingTarget(null);
        profileSheetRef.current?.close();
        
        await AsyncStorage.setItem('last_logged_in_phone', targetPhone);
        
        Alert.alert('Account Switched', `Welcome back, ${userProfile.full_name || 'user'}!`);
      } catch (meErr: any) {
        console.warn('Session verification failed, attempting PIN login fallback:', meErr?.response?.data || meErr);
        // Fall back to clean login since we have the PIN
        try {
          const loginResp = await apiClient.post('/auth/login', { phone: targetPhone, pin });
          const { access_token, refresh_token, user: userProfile } = loginResp.data;
          await setActiveTokens(targetPhone, access_token, refresh_token);
          
          login(userProfile);
          
          setIsSwitchingModalVisible(false);
          setSwitchingTarget(null);
          profileSheetRef.current?.close();
          
          await AsyncStorage.setItem('last_logged_in_phone', targetPhone);
          
          Alert.alert('Account Switched', `Welcome back, ${userProfile.full_name || 'user'}!`);
        } catch (loginErr: any) {
          console.error('Switch fallback login failed:', loginErr?.response?.data || loginErr);
          setSwitchError('Session expired. Please log in again.');
        }
      }
    } catch (err: any) {
      console.error('Account switch verification failed:', err?.response?.data || err);
      setSwitchError('Failed to verify session. Try logging in again.');
    }
  };

  const handlePinDigitPress = async (digit: string) => {
    if (switchPin.length >= 6) return;
    const newPin = switchPin + digit;
    setSwitchPin(newPin);
    
    if (newPin.length === 6) {
      const targetPhone = switchingTarget.phone;
      const sanitized = targetPhone.replace(/[^\w.-]/g, '');
      const storedPin = await SecureStore.getItemAsync(`user_pin_${sanitized}`);
      
      if (storedPin && storedPin === newPin) {
        await executeAccountSwitch(targetPhone, newPin);
      } else {
        setSwitchError('Incorrect PIN. Please try again.');
        setSwitchPin('');
      }
    }
  };

  const handlePinBackspace = () => {
    setSwitchPin(prev => prev.slice(0, -1));
    setSwitchError('');
  };

  const handleAddAccount = async () => {
    if (user?.phone) {
      try {
        await clearActiveSession(user.phone);
        await AsyncStorage.setItem('suppress_auto_bio', 'true');
        await AsyncStorage.setItem('redirect_to_login', 'true');
      } catch (e) {
        console.warn(e);
      }
    }
    profileSheetRef.current?.close();
    logout();
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera roll permissions are required to pick a profile image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedUri = result.assets[0].uri;
        setAvatarUri(selectedUri);
        if (user?.id) {
          await AsyncStorage.setItem(`user_avatar_${user.id}`, selectedUri);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while picking the image.');
    }
  };

  const handleAvatarPress = () => {
    Alert.alert(
      'Profile Photo',
      'Choose an action for your profile picture.',
      [
        { text: 'View Photo', onPress: () => setIsViewingPhoto(true) },
        { text: 'Change Photo', onPress: pickImage },
        { 
          text: 'Remove Photo', 
          style: 'destructive',
          onPress: async () => {
            setAvatarUri(DEFAULT_AVATAR_URL);
            if (user?.id) {
              await AsyncStorage.removeItem(`user_avatar_${user.id}`);
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  const getPersonalizedGreeting = () => {
    if (!user?.full_name) return 'User';
    const parts = user.full_name.trim().split(' ');
    if (parts.length >= 2) {
      const titles = ['Mr.', 'Mrs.', 'Ms.'];
      if (titles.includes(parts[0])) {
        return `${parts[0]} ${parts[1]}`;
      }
      return parts[0];
    }
    return user.full_name;
  };

  const getGreetingPrefix = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning,';
    if (hour < 17) return 'Good Afternoon,';
    return 'Good Evening,';
  };

  const personalizedGreeting = getPersonalizedGreeting();

  const income = summary?.current_month?.income ? parseFloat(summary.current_month.income) : 0;
  const expense = summary?.current_month?.expense ? parseFloat(summary.current_month.expense) : 0;
  const net = summary?.current_month?.net ? parseFloat(summary.current_month.net) : 0;
  const transactions = transactionsData?.data || [];

  const renderTransactionItem = ({ item }: { item: Transaction }) => (
    <TouchableOpacity className={`flex-row items-center justify-between p-4 ${isDark ? 'bg-dark-surface-container-low active:bg-dark-surface-container-lowest' : 'bg-surface-container-low active:bg-surface-container-high'} rounded-[24px] mb-3 transition-all shadow-sm`}>
      <View className="flex-row items-center flex-1">
        <View 
          className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-lowest'} shadow-sm`}
        >
          <Tag size={20} color={item.category.color || (theme === 'dark' ? '#b2b6b1' : '#707a6c')} />
        </View>
        <View className="flex-1">
          <Text className={`font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} text-base`} numberOfLines={1}>
            {item.description || item.category.name}
          </Text>
          <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} text-[10px] uppercase tracking-widest font-bold`}>
            {item.category.name} • {item.transaction_date}
          </Text>
        </View>
      </View>
      <Text className={`font-headline font-bold text-sm ${
        item.transaction_type === 'income' ? 'text-success' : 'text-error'
      }`}>
        {item.transaction_type === 'income' ? '+' : '-'}{hideBalances ? "₵ ••••" : formatGHS(item.amount)}
      </Text>
    </TouchableOpacity>
  );

  const BudgetCard = ({ item }: { item: Budget }) => (
    <View className={`min-w-[280px] ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20' : 'bg-surface-container-lowest border-outline-variant/10'} rounded-[32px] p-6 shadow-sm border mr-4`}>
      <View className="flex-row justify-between items-center mb-6">
        <View className="w-10 h-10 rounded-xl bg-tertiary/10 items-center justify-center">
          <Tag size={20} color="#993300" />
        </View>
        <Text className="text-[10px] font-bold text-tertiary uppercase tracking-widest">
          {Math.round(item.percentage_used)}% Used
        </Text>
      </View>
      <Text className={`font-headline font-bold text-lg mb-1 ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>{item.category.name}</Text>
      <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} text-[10px] font-bold uppercase tracking-widest mb-4`}>
        {hideBalances ? "₵ ••••" : formatGHS(item.spent_amount)} of {hideBalances ? "₵ ••••" : formatGHS(item.budgeted_amount)}
      </Text>
      <View className={`w-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container'} h-2 rounded-full overflow-hidden`}>
        <View 
          className="bg-tertiary h-full rounded-full" 
          style={{ width: `${Math.min(100, item.percentage_used)}%` }} 
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
      <CoinBackground />
      <ConfettiEffect active={showConfetti} onComplete={() => setShowConfetti(false)} />
      {/* Sticky Custom AppBar */}
      <View className="flex-row items-center justify-between px-6 py-4">
        <View className="flex-row items-center space-x-4">
          <TouchableOpacity 
            onPress={() => ussdSheetRef.current?.snapToIndex(0)}
            className={`p-2 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} active:scale-95 transition-all`}
          >
            <Menu size={24} color={theme === 'dark' ? '#e1e3e0' : '#0d631b'} />
          </TouchableOpacity>
          {user?.has_premium_access ? (
            <Text className={`font-headline font-black ${isDark ? 'text-[#e5a93b]' : 'text-[#a05915]'} text-xl tracking-tight`}>CediSmart Pro</Text>
          ) : (
            <Text className={`font-headline font-black ${isDark ? 'text-[#2e7d32]' : 'text-[#0d631b]'} text-xl tracking-tight`}>CediSmart</Text>
          )}
        </View>
        <View className="flex-row items-center space-x-3">
          <TouchableOpacity 
            onPress={() => navigation.navigate('Accounts')}
            className={`p-2 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} active:scale-95 transition-all mr-1`}
          >
            <Landmark size={20} color={theme === 'dark' ? '#e1e3e0' : '#0d631b'} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => profileSheetRef.current?.snapToIndex(0)}
            className="w-10 h-10 rounded-full bg-primary-container overflow-hidden border border-primary/20 active:scale-95 transition-all"
          >
            <Image 
              source={{ uri: avatarUri }} 
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        className="flex-1" 
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
        <View className="px-6 pt-6 pb-24">
          {/* Header Section */}
          <View className="mb-8">
            <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-label uppercase tracking-widest text-[10px] mb-2`}>Dashboard Overview</Text>
            <Text className={`text-4xl font-headline font-extrabold tracking-tight leading-none ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
              {getGreetingPrefix()}{"\n"}{personalizedGreeting}
            </Text>
          </View>

          <View 
            className="relative overflow-hidden rounded-[40px] p-8 shadow-2xl mb-10"
            style={{
              backgroundColor: '#122214',
              borderColor: 'rgba(34, 197, 94, 0.2)',
              borderWidth: 1
            }}
          >
            {/* Watermark */}
            <View className="absolute top-0 right-0 opacity-10 translate-x-1/4 -translate-y-1/4">
              <Landmark size={240} color="white" strokeWidth={1} />
            </View>

            <View className="relative z-10">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-white/70 font-label text-[10px] uppercase tracking-widest">Current Net Position</Text>
                <TouchableOpacity 
                  onPress={toggleHideBalances}
                  className="bg-white/20 px-3 py-1.5 rounded-xl flex-row items-center active:bg-white/30"
                  accessibilityLabel="Toggle Balance Visibility"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {hideBalances ? (
                    <EyeOff size={16} color="white" />
                  ) : (
                    <Eye size={16} color="white" />
                  )}
                  <Text className="text-white text-[11px] font-bold font-label ml-1.5">{hideBalances ? 'Show' : 'Hide'}</Text>
                </TouchableOpacity>
              </View>

              <View className="mb-10">
                {isAccountsLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" className="self-start mt-2" />
                ) : (
                  <Text className="text-4xl md:text-5xl font-headline font-extrabold tracking-tighter text-white">
                    {hideBalances ? "₵ ••••" : formatGHS(totalNetWorth)}
                  </Text>
                )}
              </View>

              <View className="flex-row justify-between pt-8 border-t border-white/10">
                <View>
                  <Text className="text-white/60 font-label text-[10px] uppercase tracking-widest block mb-1">Total Income</Text>
                  <View className="flex-row items-center space-x-2">
                    <Text className="text-xl font-bold text-success">{hideBalances ? "₵ ••••" : formatGHS(income)}</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-white/60 font-label text-[10px] uppercase tracking-widest block mb-1">Total Expenses</Text>
                  <View className="flex-row items-center space-x-2">
                    <Text className="text-xl font-bold text-error">{hideBalances ? "₵ ••••" : formatGHS(expense)}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Quick Actions Bar */}
          <View className="flex-row justify-around items-center mb-10 px-2">
            <TouchableOpacity 
              onPress={() => navigation.navigate('AddTransaction')}
              className="items-center"
            >
              <View className={`w-14 h-14 rounded-2xl ${isDark ? 'bg-primary/20' : 'bg-primary/10'} items-center justify-center mb-2 active:scale-95 transition-all shadow-sm`}>
                <Plus size={24} color={isDark ? '#4db6ac' : '#0d631b'} />
              </View>
              <Text className={`text-[11px] font-bold font-headline ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Add Txn</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => navigation.navigate('AddTransaction', { openAiPaste: true })}
              className="items-center"
            >
              <View className={`w-14 h-14 rounded-2xl ${isDark ? 'bg-amber-500/20' : 'bg-amber-500/10'} items-center justify-center mb-2 active:scale-95 transition-all shadow-sm`}>
                <Sparkles size={22} color="#d97706" />
              </View>
              <Text className={`text-[11px] font-bold font-headline ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>AI Parse</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => navigation.navigate('Accounts')}
              className="items-center"
            >
              <View className={`w-14 h-14 rounded-2xl ${isDark ? 'bg-indigo-500/20' : 'bg-indigo-500/10'} items-center justify-center mb-2 active:scale-95 transition-all shadow-sm`}>
                <Landmark size={20} color={isDark ? '#818cf8' : '#4f46e5'} />
              </View>
              <Text className={`text-[11px] font-bold font-headline ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Accounts</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => ussdSheetRef.current?.snapToIndex(0)}
              className="items-center"
            >
              <View className={`w-14 h-14 rounded-2xl ${isDark ? 'bg-teal-500/20' : 'bg-teal-500/10'} items-center justify-center mb-2 active:scale-95 transition-all shadow-sm`}>
                <Smartphone size={20} color={isDark ? '#26a69a' : '#0d8a72'} />
              </View>
              <Text className={`text-[11px] font-bold font-headline ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>USSD</Text>
            </TouchableOpacity>
          </View>

          {/* Active Vaults (Budgets) Section */}
          <View className="mb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-xl font-headline font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Active Vaults</Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate('BudgetsTab')}
                className={`p-1.5 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} active:scale-95`}
              >
                <Plus size={20} color={theme === 'dark' ? '#e1e3e0' : '#0d631b'} />
              </TouchableOpacity>
            </View>

            {!budgets || budgets.length === 0 ? (
              <View className={`${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} rounded-[32px] p-8 items-center border border-outline-variant/10`}>
                <Text className={`font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base mb-2`}>No active vaults</Text>
                <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs text-center leading-relaxed`}>
                  Set budgeting limits on food, transport, or bills to prevent overspending and grow your net worth.
                </Text>
              </View>
            ) : (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 24 }}
              >
                {budgets.map((item) => (
                  <BudgetCard key={item.id} item={item} />
                ))}
              </ScrollView>
            )}
          </View>

          {/* Recent Transactions Section */}
          <View className="mb-10">
            <View className="flex-row justify-between items-center mb-6">
              <View className="flex-row items-center space-x-2">
                <Text className={`text-xl font-headline font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Recent Activity</Text>
                <TouchableOpacity 
                  onPress={() => {
                    setSearchQuery('');
                    setFilterType('all');
                    ledgerSheetRef.current?.snapToIndex(0);
                  }}
                  className="p-1 rounded-full active:bg-gray-100 dark:active:bg-dark-surface-container-low"
                >
                  <Search size={18} color={isDark ? '#e1e3e0' : '#1C1C2E'} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  setSearchQuery('');
                  setFilterType('all');
                  ledgerSheetRef.current?.snapToIndex(0);
                }}
              >
                <Text className="text-xs font-bold text-primary font-label uppercase tracking-wider">View All</Text>
              </TouchableOpacity>
            </View>

            {isTransactionsLoading ? (
              <ActivityIndicator size="large" color="#0d631b" className="py-8" />
            ) : transactions.length === 0 ? (
              <View className={`${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} rounded-[32px] p-8 items-center border border-outline-variant/10`}>
                <Text className={`font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base mb-2`}>No transactions yet</Text>
                <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs text-center leading-relaxed`}>
                  Record your cash expenses, mobile money, or bank transfers using the action button below.
                </Text>
              </View>
            ) : (
              <FlatList
                data={transactions}
                renderItem={renderTransactionItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            )}
          </View>
        </View>
      </ScrollView>

      {/* Floating Add Button */}
      <TouchableOpacity 
        onPress={() => navigation.navigate('AddTransaction')}
        className="absolute bottom-28 right-6 w-16 h-16 bg-primary rounded-full items-center justify-center shadow-xl shadow-primary/30 z-30 active:scale-95 transition-all"
      >
        <Plus color="white" size={32} />
      </TouchableOpacity>

      {/* USSD Helper Sheet */}
      <BottomSheet
        ref={ussdSheetRef}
        index={-1}
        snapPoints={['62%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>USSD Quick Codes</Text>
              <TouchableOpacity onPress={() => ussdSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Close</Text>
              </TouchableOpacity>
            </View>
            <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs mb-6 leading-relaxed`}>
              Quickly dial Mobile Money operator codes. On compatible mobile devices, this will dial automatically.
            </Text>

            <View className="space-y-4">
              {[
                { 
                  name: 'MTN Mobile Money', 
                  code: '*170#', 
                  desc: 'Transfer money, pay bills, cash out, check wallet balance.',
                  logo: (
                    <View className="w-12 h-12 rounded-xl bg-[#FFCC00] items-center justify-center mr-4 border border-black/5 shadow-sm">
                      <View className="px-1.5 py-0.5 rounded-full border border-black items-center justify-center bg-[#FFCC00] scale-90">
                        <Text style={{ fontFamily: 'System', fontWeight: '900', fontSize: 10, color: '#000', letterSpacing: -0.5 }}>MTN</Text>
                      </View>
                    </View>
                  )
                },
                { 
                  name: 'Telecel Cash', 
                  code: '*110#', 
                  desc: 'Send money, buy bundles, pay Telecel utilities.',
                  logo: (
                    <View className="w-12 h-12 rounded-xl bg-[#E60000] items-center justify-center mr-4 border border-black/5 shadow-sm">
                      <View className="w-7 h-7 rounded-full border border-white/60 items-center justify-center bg-[#E60000]">
                        <Text style={{ fontFamily: 'System', fontWeight: '900', fontSize: 12, color: '#FFF' }}>t</Text>
                      </View>
                    </View>
                  )
                },
                { 
                  name: 'AT Money', 
                  code: '*110#', 
                  desc: 'Access AT money transfers and services.',
                  logo: (
                    <View className="w-12 h-12 rounded-xl bg-[#0055A5] items-center justify-center mr-4 border border-black/5 shadow-sm">
                      <View className="flex-row items-center justify-center">
                        <Text style={{ fontFamily: 'System', fontWeight: '900', fontSize: 14, color: '#FFF', letterSpacing: -0.8 }}>at</Text>
                        <View className="w-1.5 h-1.5 rounded-full bg-[#E60000] ml-0.5" />
                      </View>
                    </View>
                  )
                },
              ].map((op, idx) => (
                <TouchableOpacity 
                  key={idx}
                  onPress={async () => {
                    const dialUrl = `tel:${op.code.replace('#', '%23')}`;
                    try {
                      const supported = await Linking.canOpenURL(dialUrl);
                      if (supported) {
                        await Linking.openURL(dialUrl);
                      } else {
                        Alert.alert('USSD Code', `Dialing is not supported on this environment. The code is: ${op.code}`);
                      }
                    } catch (e) {
                      Alert.alert('USSD Code', `The code is: ${op.code}`);
                    }
                  }}
                  className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 active:bg-dark-surface-container-low' : 'bg-white border-gray-100 active:bg-gray-50'} p-5 rounded-2xl border shadow-sm`}
                >
                  {op.logo}
                  <View className="flex-1">
                    <View className="flex-row justify-between items-baseline mb-1">
                      <Text className={`font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base`}>{op.name}</Text>
                      <Text className="font-headline font-black text-primary text-sm">{op.code}</Text>
                    </View>
                    <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs leading-relaxed`}>{op.desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Profile Status Sheet */}
      <BottomSheet
        ref={profileSheetRef}
        index={-1}
        snapPoints={['68%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 py-4 items-center">
            <View className="w-full flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>My Status</Text>
              <TouchableOpacity onPress={() => profileSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Close</Text>
              </TouchableOpacity>
            </View>

            {/* Profile Avatar Card */}
            <View className={`w-full ${isDark ? 'bg-[#222a23] border-[#2f3b31]' : 'bg-white border-gray-100'} p-6 rounded-3xl border shadow-sm items-center mb-6`}>
              <TouchableOpacity onPress={handleAvatarPress} className="relative mb-4">
                <View className={`w-20 h-20 rounded-full bg-primary-container overflow-hidden border-2 ${isDark ? 'border-primary/40' : 'border-primary/20'}`}>
                  <Image 
                    source={{ uri: avatarUri }} 
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>
                <View 
                  className={`absolute bottom-0 right-0 w-7 h-7 bg-primary rounded-full items-center justify-center border-2 ${isDark ? 'border-dark-surface-container-lowest' : 'border-white'} active:scale-90 shadow-lg`}
                >
                  <Plus size={16} color="white" />
                </View>
              </TouchableOpacity>
              <Text className={`font-headline font-bold text-xl ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-1`}>{user?.full_name || 'CediSmart User'}</Text>
              <Text className={`font-body ${isDark ? 'text-gray-400' : 'text-gray-500'} text-sm mb-4`}>{user?.phone}</Text>
              
              {/* Status Badges */}
              <View className="flex-row space-x-3 items-center justify-between w-full mt-2">
                <TouchableOpacity 
                  disabled={isKycVerified}
                  onPress={() => {
                    profileSheetRef.current?.close();
                    navigation.navigate('SettingsTab');
                    Alert.alert('Verify Identity', 'Please click on the "Identity Verification" option in settings to verify your Ghana Card.');
                  }}
                  className={`flex-1 items-center justify-center p-4 rounded-2xl border ${
                    isKycVerified 
                      ? isDark ? 'bg-success/20 border-success/30' : 'bg-success/10 border-success/20' 
                      : isDark ? 'bg-amber-500/20 border-amber-500/30' : 'bg-amber-500/10 border-amber-500/20'
                  } active:scale-95 transition-all shadow-sm`}
                >
                  <ShieldCheck size={24} color={isKycVerified ? (isDark ? '#4ade80' : '#16a34a') : (isDark ? '#fbbf24' : '#d97706')} />
                  <Text className={`font-label font-bold text-[9px] uppercase tracking-wider text-center mt-2.5 ${
                    isKycVerified 
                      ? isDark ? 'text-success dark:text-[#4ade80]' : 'text-success' 
                      : isDark ? 'text-amber-400' : 'text-amber-600'
                  }`}>
                    {isKycVerified ? 'Tier 1 Verified' : 'Unverified\n(Tap to verify)'}
                  </Text>
                </TouchableOpacity>

                {user?.has_premium_access ? (
                  <View className={`flex-1 items-center justify-center p-4 rounded-2xl border ${isDark ? 'bg-secondary/20 border-secondary/30' : 'bg-secondary/10 border-secondary/20'} shadow-sm`}>
                    <Award size={24} color={isDark ? '#818cf8' : '#4c56af'} />
                    <Text className={`font-label font-bold text-[9px] uppercase tracking-wider text-center mt-2.5 ${isDark ? 'text-[#818cf8]' : 'text-secondary'}`}>Pro Member</Text>
                  </View>
                ) : (
                  <TouchableOpacity 
                    onPress={() => {
                      profileSheetRef.current?.close();
                      navigation.navigate('SettingsTab');
                      Alert.alert('Upgrade to Pro', 'Unlock unlimited accounts, budgets, and statement exports by upgrading in Settings.');
                    }}
                    className={`flex-1 items-center justify-center p-4 rounded-2xl border ${isDark ? 'bg-dark-surface-container-low border-dark-outline-variant/20' : 'bg-gray-100 border-gray-200'} active:scale-95 transition-all shadow-sm`}
                  >
                    <Award size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    <Text className={`font-label font-bold text-[9px] uppercase tracking-wider text-center mt-2.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Free Tier\n(Upgrade)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Benefits Info */}
            <View className={`w-full ${isDark ? 'bg-dark-surface-container-low border-dark-outline-variant/20' : 'bg-surface-container-low border-outline-variant/10'} p-5 rounded-2xl mb-6 border`}>
              <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-2`}>Member Privileges</Text>
              <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs leading-relaxed`}>
                {user?.has_premium_access ? (
                  <>
                    ✓ Unlimited Budgets & Vaults enabled.{"\n"}
                    ✓ PDF / CSV Statement Exports unlocked.{"\n"}
                    ✓ Multi-Account Syncing active.
                  </>
                ) : (
                  <>
                    ✗ Limited to 3 active financial accounts.{"\n"}
                    ✗ Statement exports locked (PDF/CSV).{"\n"}
                    ✗ Limited offline sync capability.
                  </>
                )}
              </Text>
            </View>

            {/* Multi-Account Switcher Section */}
            {savedAccounts.length > 1 && (
              <View className="w-full mb-6">
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3 ml-1`}>
                  Switch Account
                </Text>
                {savedAccounts
                  .filter((acc) => acc.phone !== user?.phone)
                  .map((acc) => (
                    <View 
                      key={acc.phone} 
                      className={`flex-row items-center justify-between p-4 mb-2 rounded-2xl border ${
                        isDark ? 'bg-[#222a23] border-[#2f3b31]' : 'bg-white border-gray-100'
                      }`}
                    >
                      <View className="flex-row items-center flex-1 mr-3">
                        <View className={`w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3 overflow-hidden`}>
                          {accountAvatars[acc.phone] ? (
                            <Image 
                              source={{ uri: accountAvatars[acc.phone] }} 
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text className="text-primary font-headline font-bold text-sm">
                              {(acc.full_name || '')
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2) || 'CS'}
                            </Text>
                          )}
                        </View>
                        <View className="flex-1">
                          <Text className={`font-headline font-bold text-sm ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`} numberOfLines={1}>
                            {acc.full_name || 'CediSmart User'}
                          </Text>
                          <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`} numberOfLines={1}>
                            {acc.phone}
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row items-center space-x-2">
                        <TouchableOpacity 
                          onPress={() => startAccountSwitch(acc)}
                          className="px-4 py-2 bg-primary rounded-xl"
                        >
                          <Text className="text-white font-headline font-bold text-xs">Switch</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          onPress={() => {
                            Alert.alert(
                              'Remove Account',
                              `Are you sure you want to remove ${acc.full_name || acc.phone} from this device?`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { 
                                  text: 'Remove', 
                                  style: 'destructive', 
                                  onPress: () => removeSavedAccount(acc.phone) 
                                }
                              ]
                            );
                          }}
                          className={`p-2 rounded-xl ${isDark ? 'bg-error/20' : 'bg-error/10'}`}
                        >
                          <Trash2 size={16} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
              </View>
            )}

            {/* Add Account Option */}
            <TouchableOpacity
              onPress={handleAddAccount}
              className={`w-full py-4 border-2 border-dashed ${
                isDark ? 'border-primary/40 bg-[#1f2920]' : 'border-primary/30 bg-primary/5'
              } rounded-2xl items-center justify-center mb-6 flex-row space-x-2`}
            >
              <Plus size={18} color={isDark ? '#4ade80' : '#16a34a'} />
              <Text className={`font-headline font-bold text-sm ${isDark ? 'text-primary' : 'text-primary'}`}>
                Add Another Account
              </Text>
            </TouchableOpacity>

            {/* CTA Button */}
            <TouchableOpacity 
              onPress={() => {
                profileSheetRef.current?.close();
                navigation.navigate('SettingsTab');
              }}
              className="w-full py-5 bg-primary rounded-2xl items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-all"
            >
              <Text className="text-white font-headline font-bold text-base">Open Setup & Settings</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Full Transaction History Ledger Sheet */}
      <BottomSheet
        ref={ledgerSheetRef}
        index={-1}
        snapPoints={['85%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View className="px-6 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Ledger Search</Text>
              <TouchableOpacity onPress={() => ledgerSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Close</Text>
              </TouchableOpacity>
            </View>

            {/* Search Input Row with Filter Toggle */}
            <View className="flex-row items-center mb-6">
              <View className={`flex-1 flex-row items-center ${isDark ? 'bg-dark-surface-container-low border-dark-outline-variant/20' : 'bg-surface-container border-gray-200'} rounded-2xl border px-4 py-3 mr-3 shadow-sm`}>
                <Search size={20} color={isDark ? '#e1e3e0' : '#6B7280'} className="mr-3" />
                <TextInput
                  className={`flex-1 font-body text-base ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} p-0`}
                  placeholder="Search description, category..."
                  placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                />
              </View>
              <TouchableOpacity
                onPress={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`p-3.5 rounded-2xl border ${
                  showAdvancedFilters 
                    ? 'bg-primary border-primary' 
                    : isDark ? 'bg-dark-surface-container-low border-dark-outline-variant/20' : 'bg-surface-container border-gray-200'
                } active:scale-95 transition-all shadow-sm`}
              >
                <SlidersHorizontal size={20} color={showAdvancedFilters ? 'white' : (isDark ? '#e1e3e0' : '#6B7280')} />
              </TouchableOpacity>
            </View>

            {/* Filter Pills */}
            <View className="flex-row space-x-2 mb-6">
              {(['all', 'income', 'expense'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setFilterType(type)}
                  className={`px-5 py-2.5 rounded-full border ${
                    filterType === type 
                      ? 'bg-primary border-primary shadow-sm shadow-primary/20' 
                      : isDark ? 'bg-dark-surface-container-low border-dark-outline-variant/10' : 'bg-white border-gray-200'
                  }`}
                >
                  <Text className={`font-label text-xs font-bold capitalize ${filterType === type ? 'text-white' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Collapsible Advanced Filters Panel */}
            {showAdvancedFilters && (
              <View className={`p-5 rounded-3xl border mb-6 ${
                isDark 
                  ? 'bg-dark-surface-container-low border-dark-outline-variant/20' 
                  : 'bg-surface-container-lowest border-outline-variant/10'
              } shadow-sm`}>
                
                {/* Date Range Shortcuts */}
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3`}>
                  Date Range
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row space-x-2">
                    {([
                      { label: 'All Time', value: 'all' },
                      { label: 'Today', value: 'today' },
                      { label: 'Last 7 Days', value: 'week' },
                      { label: 'Last 30 Days', value: 'month' },
                      { label: 'This Year', value: 'year' }
                    ] as const).map((item) => (
                      <TouchableOpacity
                        key={item.value}
                        onPress={() => setFilterDateRange(item.value)}
                        className={`px-4 py-2 rounded-xl border ${
                          filterDateRange === item.value
                            ? 'bg-primary/20 border-primary/50'
                            : isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20' : 'bg-white border-gray-200'
                        }`}
                      >
                        <Text className={`font-label text-[11px] font-bold ${
                          filterDateRange === item.value ? 'text-primary' : (isDark ? 'text-gray-400' : 'text-gray-600')
                        }`}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Category Chip Selector */}
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3`}>
                  Category
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row space-x-2">
                    <TouchableOpacity
                      onPress={() => setFilterCategory(null)}
                      className={`px-4 py-2 rounded-xl border ${
                        filterCategory === null
                          ? 'bg-primary/20 border-primary/50'
                          : isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20' : 'bg-white border-gray-200'
                      }`}
                    >
                      <Text className={`font-label text-[11px] font-bold ${
                        filterCategory === null ? 'text-primary' : (isDark ? 'text-gray-400' : 'text-gray-600')
                      }`}>
                        All Categories
                      </Text>
                    </TouchableOpacity>
                    {categories?.map((cat: any) => (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => setFilterCategory(cat.id)}
                        className={`px-4 py-2 rounded-xl border ${
                          filterCategory === cat.id
                            ? 'bg-primary/20 border-primary/50'
                            : isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20' : 'bg-white border-gray-200'
                        }`}
                      >
                        <Text className={`font-label text-[11px] font-bold ${
                          filterCategory === cat.id ? 'text-primary' : (isDark ? 'text-gray-400' : 'text-gray-600')
                        }`}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Account Source Selector */}
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3`}>
                  Account Source
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row space-x-2">
                    <TouchableOpacity
                      onPress={() => setFilterAccount(null)}
                      className={`px-4 py-2 rounded-xl border ${
                        filterAccount === null
                          ? 'bg-primary/20 border-primary/50'
                          : isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20' : 'bg-white border-gray-200'
                      }`}
                    >
                      <Text className={`font-label text-[11px] font-bold ${
                        filterAccount === null ? 'text-primary' : (isDark ? 'text-gray-400' : 'text-gray-600')
                      }`}>
                        All Accounts
                      </Text>
                    </TouchableOpacity>
                    {accounts?.map((acc: any) => (
                      <TouchableOpacity
                        key={acc.id}
                        onPress={() => setFilterAccount(acc.id)}
                        className={`px-4 py-2 rounded-xl border ${
                          filterAccount === acc.id
                            ? 'bg-primary/20 border-primary/50'
                            : isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20' : 'bg-white border-gray-200'
                        }`}
                      >
                        <Text className={`font-label text-[11px] font-bold ${
                          filterAccount === acc.id ? 'text-primary' : (isDark ? 'text-gray-400' : 'text-gray-600')
                        }`}>
                          {acc.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Amount Bounds Numeric Range */}
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3`}>
                  Amount Range (₵)
                </Text>
                <View className="flex-row items-center space-x-3 mb-5">
                  <View className={`flex-1 flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20' : 'bg-white border-gray-200'} rounded-xl border px-3 py-2 shadow-sm`}>
                    <Text className={`text-xs font-bold mr-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Min:</Text>
                    <TextInput
                      className={`flex-1 font-body text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} p-0`}
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      value={filterMinAmount}
                      onChangeText={setFilterMinAmount}
                      keyboardType="numeric"
                    />
                  </View>
                  <View className={`flex-1 flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20' : 'bg-white border-gray-200'} rounded-xl border px-3 py-2 shadow-sm`}>
                    <Text className={`text-xs font-bold mr-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Max:</Text>
                    <TextInput
                      className={`flex-1 font-body text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} p-0`}
                      placeholder="No limit"
                      placeholderTextColor="#9CA3AF"
                      value={filterMaxAmount}
                      onChangeText={setFilterMaxAmount}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Footer details: reset action */}
                <View className="flex-row items-center justify-between border-t border-gray-200/50 dark:border-dark-outline-variant/10 pt-4">
                  <Text className={`text-xs font-body ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {filteredTransactions.length} results matching
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setSearchQuery('');
                      setFilterType('all');
                      setFilterCategory(null);
                      setFilterAccount(null);
                      setFilterMinAmount('');
                      setFilterMaxAmount('');
                      setFilterDateRange('all');
                    }}
                    className="flex-row items-center space-x-1.5 bg-error/10 px-4 py-2 rounded-xl"
                  >
                    <Text className="text-error font-headline font-bold text-xs">Reset All</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Transactions List */}
            {isAllTransactionsLoading ? (
              <ActivityIndicator size="large" color="#0d631b" className="py-12" />
            ) : filteredTransactions.length === 0 ? (
              <View className="items-center py-12">
                <Text className={`font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base mb-1`}>No transactions found</Text>
                <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs text-center`}>
                  Try adjusting your search query or filters.
                </Text>
              </View>
            ) : (
              <View className="space-y-1">
                {filteredTransactions.map((item: any) => (
                  <View key={item.id}>
                    {renderTransactionItem({ item })}
                  </View>
                ))}
              </View>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
      {/* Account Switching Verification Modal */}
      <Modal
        visible={isSwitchingModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsSwitchingModalVisible(false);
          setSwitchingTarget(null);
        }}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className={`w-full ${isDark ? 'bg-dark-background' : 'bg-background'} rounded-t-[32px] px-6 py-8 items-center border-t ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'} shadow-2xl`}>
            
            {/* Header */}
            <View className="w-full flex-row justify-between items-center mb-6">
              <Text className={`text-xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                Verify Identity
              </Text>
              <TouchableOpacity 
                onPress={() => {
                  setIsSwitchingModalVisible(false);
                  setSwitchingTarget(null);
                }}
              >
                <Text className="text-primary font-bold text-sm">Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Avatar & Prompt info */}
            <View className="items-center mb-6">
              <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-3">
                <Users size={28} color={isDark ? '#4ade80' : '#16a34a'} />
              </View>
              <Text className={`font-headline font-bold text-base ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                Switching to {switchingTarget?.full_name || 'CediSmart User'}
              </Text>
              <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                Enter your 6-digit security PIN to proceed
              </Text>
            </View>

            {/* PIN Indicators */}
            <View className="flex-row justify-center space-x-4 mb-6">
              {[...Array(6)].map((_, i) => (
                <View
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 border-primary ${
                    i < switchPin.length ? 'bg-primary' : 'bg-transparent'
                  }`}
                />
              ))}
            </View>

            {/* Error Message */}
            {switchError ? (
              <Text className="text-error text-xs font-semibold mb-6 text-center">{switchError}</Text>
            ) : null}

            {/* PIN Pad */}
            <View className="w-full pb-6">
              <PINPad
                onPress={handlePinDigitPress}
                onBackspace={handlePinBackspace}
                onBiometricPress={
                  biometricAvailable
                    ? () => {
                        const target = switchingTarget;
                        if (target) {
                          const sanitized = target.phone.replace(/[^\w.-]/g, '');
                          SecureStore.getItemAsync(`user_pin_${sanitized}`).then((storedPin) => {
                            if (storedPin) {
                              triggerBiometricSwitch(target.phone, storedPin);
                            }
                          });
                        }
                      }
                    : undefined
                }
                biometricType={biometricType}
              />
            </View>

          </View>
        </View>
      </Modal>

      {/* Full-screen Profile Photo Viewer */}
      <Modal visible={isViewingPhoto} transparent={true} animationType="fade" onRequestClose={() => setIsViewingPhoto(false)}>
        <View className="flex-1 bg-black justify-center items-center relative">
          <TouchableOpacity 
            onPress={() => setIsViewingPhoto(false)}
            className="absolute top-14 right-6 p-3 bg-white/10 rounded-full active:scale-90"
          >
            <Text className="text-white font-headline font-bold text-sm">Close</Text>
          </TouchableOpacity>
          <Image 
            source={{ uri: avatarUri }} 
            className="w-[90%] aspect-square rounded-2xl" 
            resizeMode="contain" 
          />
        </View>
      </Modal>

    </SafeAreaView>
  );
};

export default DashboardScreen;
