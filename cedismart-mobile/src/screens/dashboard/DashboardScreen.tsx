import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { GlassSheetBackground } from '../../components/glass/GlassSheetBackground';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassSurface } from '../../components/glass/GlassSurface';
import { useGlassTabBarMetrics } from '../../components/glass/useGlassTabBarMetrics';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, ScrollView, Image, Dimensions, Linking, Alert, TextInput, Modal, RefreshControl, Keyboard, TouchableWithoutFeedback, StyleSheet, AppState, Clipboard, LayoutAnimation, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { useOfflineStore } from '../../stores/offlineStore';
import { formatGHS } from '../../utils/currency';
import { Plus, Tag, Landmark, Smartphone, ShieldCheck, Award, Search, Sparkles, Trash2, Users, SlidersHorizontal, Eye, EyeOff, Clock, RefreshCw, Edit3, X, Headphones, ArrowUpRight, ArrowDownRight, Calendar, Zap, RotateCcw, Check } from 'lucide-react-native';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import PINPad from '../../components/shared/PINPad';
import apiClient, { setActiveTokens, clearActiveSession } from '../../api/client';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { ConfettiEffect } from '../../components/shared/ConfettiEffect';
import { SupportModal } from '../../components/shared/SupportModal';
import { TopBarSupportTooltip } from '../../components/shared/TopBarSupportTooltip';
import { SwipeableTransactionCard } from '../../components/shared/SwipeableTransactionCard';
import uuid from 'react-native-uuid';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const DEFAULT_AVATAR_URL = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCPbtwyh4Eo_96C5zd6dFJFY9kbHP067jJpa7Aayw3aUk1co9x1_rJZOkN1473J1n10wGOmZyH_imPk56BMFUhtqh97n0NlHcDadkkvYPKlykD_wgKQ0fNUrBK4Iu1lJLUicP3eclDQXCGAAWUx5hODGPkFmHdt7ak3QMG9zCIQ1woeQWjZ7lpo8WpbJ3fIQepJ_Q7ZT7r1xyJBsDS0TdhOmQJP54CdoizSC8UpE8ln59Y5-6_lJNv8GhvkiAlc4Ddi9D8xyhpQ_YM';

interface Transaction {
  id: string;
  amount: string;
  transaction_type: 'income' | 'expense' | 'transfer';
  description: string | null;
  transaction_date: string;
  account?: {
    id: string;
    name: string;
  };
  category: {
    id?: string;
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
  const { clearance: tabBarClearance } = useGlassTabBarMetrics();
  const { user, logout, savedAccounts, loadSavedAccounts, removeSavedAccount, login } = useAuthStore();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();
  const { pendingCount, syncTransactions } = useOfflineSync();
  const { queue: offlineQueue, removeTransactions: removeOfflineTransactions } = useOfflineStore();
  const [showConfetti, setShowConfetti] = useState(false);
  const prevPendingCount = useRef(pendingCount);
  const ussdSheetRef = useRef<BottomSheet>(null);
  const profileSheetRef = useRef<BottomSheet>(null);
  const ledgerSheetRef = useRef<BottomSheet>(null);
  const editTxSheetRef = useRef<BottomSheet>(null);

  const [avatarUri, setAvatarUri] = useState<string>(DEFAULT_AVATAR_URL);
  const [isViewingPhoto, setIsViewingPhoto] = useState(false);
  const [isKycVerified, setIsKycVerified] = useState(false);
  const [isSupportModalVisible, setIsSupportModalVisible] = useState(false);
  const [startFreshSupport, setStartFreshSupport] = useState(false);

  // Transaction Detail / Edit / Delete Sheet state
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [isSavingTx, setIsSavingTx] = useState(false);

  // Multi-Account Switcher state
  const [isSwitchingModalVisible, setIsSwitchingModalVisible] = useState(false);
  const [switchingTarget, setSwitchingTarget] = useState<any>(null);
  const [switchPin, setSwitchPin] = useState('');
  const [switchError, setSwitchError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | null>(null);
  const [accountAvatars, setAccountAvatars] = useState<Record<string, string>>({});
  const [hideBalances, setHideBalances] = useState(false);

  // Smart Clipboard MoMo SMS Sniffer state
  const [sniffedSms, setSniffedSms] = useState<{
    rawSms: string;
    amount: string;
    type: 'income' | 'expense';
    description: string;
    categoryName: string;
    categoryId?: string;
  } | null>(null);
  const [isLoggingSniffedSms, setIsLoggingSniffedSms] = useState(false);

  // Undo Toast & Swipe Delete state
  const [hiddenTxIds, setHiddenTxIds] = useState<Set<string>>(new Set());
  const [undoTx, setUndoTx] = useState<{ tx: Transaction; timeoutId: any; secondsLeft: number } | null>(null);

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

  // All Transactions Search, Filter & Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterAccount, setFilterAccount] = useState<string | null>(null);
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [extraLedgerItems, setExtraLedgerItems] = useState<Transaction[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim().length > 0 ||
      filterType !== 'all' ||
      filterCategory !== null ||
      filterAccount !== null ||
      filterMinAmount.trim().length > 0 ||
      filterMaxAmount.trim().length > 0 ||
      filterDateRange !== 'all'
    );
  }, [searchQuery, filterType, filterCategory, filterAccount, filterMinAmount, filterMaxAmount, filterDateRange]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setFilterCategory(null);
    setFilterAccount(null);
    setFilterMinAmount('');
    setFilterMaxAmount('');
    setFilterDateRange('all');
    setLedgerPage(1);
    setExtraLedgerItems([]);
  };

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

  const { data: summary, refetch: refetchSummary } = useQuery({
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

  // Safe-to-Spend Today Dynamic Budget Metric (Allowance = Remaining / Days Left)
  const safeToSpendToday = useMemo(() => {
    if (!budgets || budgets.length === 0) return null;
    const totalBudgeted = budgets.reduce((acc, b) => acc + (parseFloat(b.budgeted_amount) || 0), 0);
    const totalSpent = budgets.reduce((acc, b) => acc + (parseFloat(b.spent_amount) || 0), 0);
    if (totalBudgeted <= 0) return null;
    const remaining = Math.max(0, totalBudgeted - totalSpent);
    const now = new Date();
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(1, totalDaysInMonth - now.getDate() + 1);
    const dailyAllowance = remaining / daysLeft;
    const status: 'healthy' | 'moderate' | 'tight' =
      dailyAllowance > 50 ? 'healthy' : dailyAllowance > 15 ? 'moderate' : 'tight';
    return {
      dailyAllowance,
      remaining,
      daysLeft,
      status,
    };
  }, [budgets]);

  // Reset pagination when server-side filters change
  useEffect(() => {
    setLedgerPage(1);
    setExtraLedgerItems([]);
  }, [searchQuery, filterType, filterCategory, filterAccount]);

  const buildLedgerQueryParams = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      params.set('per_page', '50');
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (filterType !== 'all') params.set('transaction_type', filterType);
      if (filterCategory) params.set('category_id', filterCategory);
      if (filterAccount) params.set('account_id', filterAccount);
      return params.toString();
    },
    [searchQuery, filterType, filterCategory, filterAccount]
  );

  const { data: allTransactionsData, isLoading: isAllTransactionsLoading, refetch: refetchAllTransactions } = useQuery({
    queryKey: ['transactions', 'all', user?.id, searchQuery.trim(), filterType, filterCategory, filterAccount],
    queryFn: async () => {
      const response = await apiClient.get(`/transactions/?${buildLedgerQueryParams(1)}`);
      return response.data;
    },
    enabled: !!user?.id
  });

  const allTransactions = useMemo(() => {
    const firstPage = allTransactionsData?.data || [];
    if (extraLedgerItems.length === 0) return firstPage;
    const seen = new Set(firstPage.map((t: any) => t.id));
    return [...firstPage, ...extraLedgerItems.filter((t) => !seen.has(t.id))];
  }, [allTransactionsData?.data, extraLedgerItems]);

  const totalServerTransactions = allTransactionsData?.pagination?.total || 0;

  const handleLoadMoreTransactions = async () => {
    if (isLoadingMore || allTransactions.length >= totalServerTransactions) return;
    setIsLoadingMore(true);
    try {
      const nextPage = ledgerPage + 1;
      const response = await apiClient.get(`/transactions/?${buildLedgerQueryParams(nextPage)}`);
      const newItems = response.data?.data || [];
      setExtraLedgerItems((prev) => [...prev, ...newItems]);
      setLedgerPage(nextPage);
    } catch (e) {
      console.warn('Failed to load more transactions:', e);
    } finally {
      setIsLoadingMore(false);
    }
  };

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

  const closeEditTransactionSheet = () => {
    Keyboard.dismiss();
    editTxSheetRef.current?.close();
    setSelectedTx(null);
  };

  const openTransactionDetail = (tx: Transaction) => {
    Haptics.selectionAsync().catch(() => {});
    Keyboard.dismiss();
    setSelectedTx(tx);
    setEditAmount(String(tx.amount));
    setEditDescription(tx.description || '');
    setEditDate(tx.transaction_date);
    setEditCategoryId(tx.category?.id || null);
    editTxSheetRef.current?.snapToIndex(0);
  };

  const handleSaveTransactionEdit = async () => {
    if (!selectedTx) return;
    Keyboard.dismiss();
    const numericAmount = parseFloat(editAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }
    setIsSavingTx(true);
    try {
      await apiClient.patch(`/transactions/${selectedTx.id}`, {
        amount: numericAmount,
        description: editDescription.trim() || null,
        transaction_date: editDate,
        ...(editCategoryId ? { category_id: editCategoryId } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      closeEditTransactionSheet();
      Alert.alert('Updated', 'Transaction updated successfully.');
    } catch (err: any) {
      Alert.alert('Update Failed', err.response?.data?.error?.message || 'Could not update transaction.');
    } finally {
      setIsSavingTx(false);
    }
  };

  const handleDeleteTransaction = () => {
    if (!selectedTx) return;
    Keyboard.dismiss();
    Alert.alert(
      'Delete Transaction?',
      `Are you sure you want to delete this ${formatGHS(selectedTx.amount)} transaction? Your account balance and reports will be updated automatically.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsSavingTx(true);
            try {
              await apiClient.delete(`/transactions/${selectedTx.id}`);
              queryClient.invalidateQueries({ queryKey: ['transactions'] });
              queryClient.invalidateQueries({ queryKey: ['accounts'] });
              queryClient.invalidateQueries({ queryKey: ['budgets'] });
              queryClient.invalidateQueries({ queryKey: ['reports'] });
              closeEditTransactionSheet();
            } catch (err: any) {
              Alert.alert('Delete Failed', err.response?.data?.error?.message || 'Could not delete transaction.');
            } finally {
              setIsSavingTx(false);
            }
          },
        },
      ]
    );
  };

  // Smart Clipboard MoMo SMS Sniffer Logic
  const isMoMoSms = (text: string) => {
    if (!text || text.length < 15) return false;
    const lower = text.toLowerCase();
    const hasProvider =
      lower.includes('payment received') ||
      lower.includes('payment made') ||
      lower.includes('you have sent') ||
      lower.includes('cash out') ||
      lower.includes('cash in') ||
      lower.includes('telecel cash') ||
      lower.includes('at money') ||
      lower.includes('momo') ||
      lower.includes('trans id:') ||
      lower.includes('transaction id:') ||
      lower.includes('financial transaction id:');
    const hasCurrency =
      lower.includes('ghs') ||
      lower.includes('gh₵') ||
      lower.includes('gh¢') ||
      lower.includes('cedis');
    return hasProvider && hasCurrency;
  };

  const checkClipboardForMoMo = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (!text || !isMoMoSms(text)) return;
      const sig = text.trim();
      const lastSniffed = await AsyncStorage.getItem('last_sniffed_momo_sig');
      if (lastSniffed === sig) return;

      const res = await apiClient.post('/transactions/parse-sms', { sms: sig });
      if (res.data && res.data.amount) {
        setSniffedSms({
          rawSms: sig,
          amount: String(res.data.amount),
          type: res.data.transaction_type === 'income' ? 'income' : 'expense',
          description: res.data.description || 'Mobile Money Transaction',
          categoryName: res.data.category_name || 'General',
          categoryId: res.data.category_id,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch {
      // Ignore background clipboard parse failure
    }
  }, []);

  useEffect(() => {
    checkClipboardForMoMo();
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkClipboardForMoMo();
      }
    });
    return () => sub.remove();
  }, [checkClipboardForMoMo]);

  const handleConfirmSniffedSms = async () => {
    if (!sniffedSms) return;
    setIsLoggingSniffedSms(true);
    try {
      const targetAccount = accounts?.find((a: any) => a.account_type === 'momo') || accounts?.[0];
      const today = new Date().toISOString().split('T')[0];
      await apiClient.post('/transactions/', {
        amount: sniffedSms.amount,
        transaction_type: sniffedSms.type,
        description: sniffedSms.description,
        transaction_date: today,
        account_id: targetAccount?.id,
        category_id: sniffedSms.categoryId,
        client_id: uuid.v4(),
      });
      await AsyncStorage.setItem('last_sniffed_momo_sig', sniffedSms.rawSms);
      setSniffedSms(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      Alert.alert('MoMo Logged!', `Successfully recorded ${formatGHS(sniffedSms.amount)} to your ledger.`);
    } catch (err: any) {
      Alert.alert('Could Not Log', err?.response?.data?.detail || 'Failed to record transaction.');
    } finally {
      setIsLoggingSniffedSms(false);
    }
  };

  const handleDismissSniffedSms = async () => {
    if (sniffedSms) {
      await AsyncStorage.setItem('last_sniffed_momo_sig', sniffedSms.rawSms);
      setSniffedSms(null);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  // Swipe-to-Delete with 5-Second Undo Toast
  const handleSwipeDelete = (tx: Transaction) => {
    setHiddenTxIds((prev) => new Set(prev).add(tx.id));

    if (undoTx?.timeoutId) {
      clearTimeout(undoTx.timeoutId);
    }

    let remainingSeconds = 5;
    const intervalId = setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        clearInterval(intervalId);
        apiClient
          .delete(`/transactions/${tx.id}`)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            queryClient.invalidateQueries({ queryKey: ['reports'] });
          })
          .catch((e) => console.error('Deletion error:', e));
        setUndoTx(null);
        setHiddenTxIds((prev) => {
          const next = new Set(prev);
          next.delete(tx.id);
          return next;
        });
      } else {
        setUndoTx((curr) => (curr ? { ...curr, secondsLeft: remainingSeconds } : null));
      }
    }, 1000);

    setUndoTx({
      tx,
      timeoutId: intervalId,
      secondsLeft: 5,
    });
  };

  const handleUndoDelete = () => {
    if (undoTx) {
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      clearInterval(undoTx.timeoutId);
      setHiddenTxIds((prev) => {
        const next = new Set(prev);
        next.delete(undoTx.tx.id);
        return next;
      });
      setUndoTx(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  // Sync data, avatar, KYC status, and saved accounts when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadSavedAccounts();
      if (user?.id) {
        refetchSummary();
        refetchAccounts();
        refetchTransactions();
        refetchBudgets();
        refetchAllTransactions();
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
    }, [user?.id, user?.has_premium_access, loadSavedAccounts, refetchSummary, refetchAccounts, refetchTransactions, refetchBudgets, refetchAllTransactions])
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
        try {
          const loginResp = await apiClient.post('/auth/login', { phone: targetPhone, pin });
          const { access_token, refresh_token, user: userProfile } = loginResp.data;
          await setActiveTokens(targetPhone, access_token, refresh_token);
          
          login(userProfile);
          
          setIsSwitchingModalVisible(false);
          setSwitchingTarget(null);
          profileSheetRef.current?.close();
          
          await AsyncStorage.setItem('last_logged_in_phone', targetPhone);
          
          Alert.alert('Profile Switched', `Welcome back, ${userProfile.full_name || 'user'}!`);
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
        
        Alert.alert('Profile Switched', `Welcome back, ${userProfile.full_name || 'user'}!`);
      } catch (meErr: any) {
        console.warn('Session verification failed, attempting PIN login fallback:', meErr?.response?.data || meErr);
        try {
          const loginResp = await apiClient.post('/auth/login', { phone: targetPhone, pin });
          const { access_token, refresh_token, user: userProfile } = loginResp.data;
          await setActiveTokens(targetPhone, access_token, refresh_token);
          
          login(userProfile);
          
          setIsSwitchingModalVisible(false);
          setSwitchingTarget(null);
          profileSheetRef.current?.close();
          
          await AsyncStorage.setItem('last_logged_in_phone', targetPhone);
          
          Alert.alert('Profile Switched', `Welcome back, ${userProfile.full_name || 'user'}!`);
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
        mediaTypes: ['images'],
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
  const transactions = transactionsData?.data || [];

  const renderTransactionItem = ({ item }: { item: Transaction }) => {
    if (hiddenTxIds.has(item.id)) return null;

    return (
      <SwipeableTransactionCard
        isDark={isDark}
        onDelete={() => handleSwipeDelete(item)}
        onCategorize={() => {
          setSelectedTx(item);
          editTxSheetRef.current?.snapToIndex(0);
        }}
        onPress={() => openTransactionDetail(item)}
      >
        <View
          style={[
            styles.transactionItemCard,
            {
              backgroundColor: isDark ? '#141e18' : '#ffffff',
              borderColor: isDark ? 'rgba(164, 243, 185, 0.14)' : 'rgba(0, 0, 0, 0.06)',
            },
          ]}
        >
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-row items-center flex-1 mr-3">
              <View 
                className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${isDark ? 'bg-white/10' : 'bg-black/5'}`}
              >
                <Tag size={20} color={item.category?.color || (theme === 'dark' ? '#b2b6b1' : '#707a6c')} />
              </View>
              <View className="flex-1">
                <Text className={`font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} text-base`} numberOfLines={1}>
                  {item.description || item.category?.name || 'Transaction'}
                </Text>
                <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} text-[10px] uppercase tracking-widest font-bold`}>
                  {item.category?.name || 'General'} • {item.transaction_date}
                </Text>
              </View>
            </View>
            <View className="items-end">
              <Text className={`font-headline font-bold text-sm ${
                item.transaction_type === 'income' ? 'text-success' : 'text-error'
              }`}>
                {item.transaction_type === 'income' ? '+' : '-'}{hideBalances ? "₵ ••••" : formatGHS(item.amount)}
              </Text>
            </View>
          </View>
        </View>
      </SwipeableTransactionCard>
    );
  };

  const BudgetCard = ({ item }: { item: Budget }) => (
    <GlassSurface radius={32} elevated style={{ minWidth: 280, marginRight: 16 }}>
      <View className="p-6">
        <View className="flex-row justify-between items-center mb-6">
          <View className="w-10 h-10 rounded-xl bg-tertiary/15 items-center justify-center">
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
        <View className={`w-full ${isDark ? 'bg-white/10' : 'bg-black/10'} h-2 rounded-full overflow-hidden`}>
          <View 
            className="bg-tertiary h-full rounded-full" 
            style={{ width: `${Math.min(100, item.percentage_used)}%` }} 
          />
        </View>
      </View>
    </GlassSurface>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
      <CoinBackground />
      <ConfettiEffect active={showConfetti} onComplete={() => setShowConfetti(false)} />
      {/* Sticky Custom AppBar (no duplicate USSD button) */}
      <View className="flex-row items-center justify-between px-6 py-4">
        <View className="flex-row items-center flex-1" style={{ minWidth: 0, marginRight: 12 }}>
          {user?.has_premium_access ? (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flexShrink: 1 }} className={`font-headline font-black ${isDark ? 'text-[#e5a93b]' : 'text-[#a05915]'} text-xl tracking-tight`}>CediSmart Pro</Text>
          ) : (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flexShrink: 1 }} className={`font-headline font-black ${isDark ? 'text-[#4ade80]' : 'text-[#0d631b]'} text-xl tracking-tight`}>CediSmart</Text>
          )}
        </View>
        <View className="flex-row items-center">
          <GlassButton accessibilityLabel="Open accounts" onPress={() => navigation.navigate('Accounts')} style={{ marginRight: 10 }}>
            <Landmark size={20} color={isDark ? '#a4f3b9' : '#0d631b'} />
          </GlassButton>
          <GlassButton accessibilityLabel="AI Support" onPress={() => { setStartFreshSupport(false); setIsSupportModalVisible(true); }} style={{ marginRight: 10 }}>
            <Headphones size={19} color={isDark ? '#4ade80' : '#0d631b'} />
          </GlassButton>
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
        <View className="px-6 pt-4" style={{ paddingBottom: tabBarClearance + 80 }}>
          {/* Header Section */}
          <View className="mb-6">
            <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-label uppercase tracking-widest text-[10px] mb-1.5`}>Home Overview</Text>
            <Text className={`text-3xl font-headline font-extrabold tracking-tight leading-tight ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
              {getGreetingPrefix()} {personalizedGreeting}
            </Text>
          </View>

          {/* Sniffed MoMo SMS Detection Card */}
          {sniffedSms && (
            <View
              style={{
                marginBottom: 20,
                borderRadius: 22,
                backgroundColor: isDark ? 'rgba(6, 78, 59, 0.94)' : 'rgba(236, 253, 245, 0.98)',
                borderColor: isDark ? 'rgba(16, 185, 129, 0.5)' : '#10b981',
                borderWidth: 1.5,
                padding: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 10,
                elevation: 6,
              }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-emerald-500/20 items-center justify-center mr-2.5">
                    <Smartphone size={16} color="#10b981" />
                  </View>
                  <View>
                    <Text className={`font-headline font-bold text-xs uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                      MoMo SMS Copied
                    </Text>
                    <Text className={`text-[10px] ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                      Tap to record directly to your ledger
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleDismissSniffedSms}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="p-1 rounded-full bg-black/10"
                >
                  <X size={14} color={isDark ? '#fff' : '#374151'} />
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center justify-between my-2 py-2 px-3 rounded-xl bg-black/15">
                <View className="flex-1 mr-2">
                  <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`} numberOfLines={1}>
                    {sniffedSms.description}
                  </Text>
                  <Text className={`text-[11px] ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    Category: {sniffedSms.categoryName}
                  </Text>
                </View>
                <Text className={`text-base font-extrabold ${sniffedSms.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {sniffedSms.type === 'income' ? '+' : '-'}{formatGHS(sniffedSms.amount)}
                </Text>
              </View>

              <View className="flex-row space-x-2 mt-2" style={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={handleConfirmSniffedSms}
                  disabled={isLoggingSniffedSms}
                  style={{
                    flex: 1,
                    backgroundColor: '#10b981',
                    paddingVertical: 10,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                  }}
                >
                  {isLoggingSniffedSms ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Check size={16} color="#fff" strokeWidth={2.5} />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>
                        Confirm & Log
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDismissSniffedSms}
                  disabled={isLoggingSniffedSms}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: isDark ? '#fff' : '#374151', fontWeight: '600', fontSize: 13 }}>
                    Dismiss
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <GlassSurface
            tint="emerald"
            elevated
            radius={36}
            style={{ marginBottom: 28, backgroundColor: 'rgba(14, 42, 20, 0.85)' }}
          >
            <View className="relative overflow-hidden p-7">
              {/* Watermark */}
              <View className="absolute top-0 right-0 opacity-10 translate-x-1/4 -translate-y-1/4">
                <Landmark size={220} color="white" strokeWidth={1} />
              </View>

              <View className="relative z-10">
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-white/80 font-label text-[11px] uppercase tracking-widest font-bold">Tracked Balance</Text>
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

                <View className="mb-6">
                  {isAccountsLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" className="self-start mt-2" />
                  ) : (
                    <>
                      <Text className="text-4xl md:text-5xl font-headline font-extrabold tracking-tighter text-white">
                        {hideBalances ? "₵ ••••" : formatGHS(totalNetWorth)}
                      </Text>
                      <Text className="text-white/60 text-[11px] mt-1">
                        Based on starting balances & recorded transactions
                      </Text>
                    </>
                  )}
                </View>

                <View className="flex-row items-center pt-5 border-t border-white/15" style={{ gap: 12 }}>
                  {/* Income Glass Capsule */}
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      borderColor: 'rgba(255, 255, 255, 0.12)',
                      borderWidth: 1,
                      borderRadius: 18,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                    }}
                  >
                    <View className="flex-row items-center mb-1">
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: 'rgba(74, 222, 128, 0.2)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 6,
                        }}
                      >
                        <ArrowUpRight size={12} color="#4ade80" strokeWidth={2.5} />
                      </View>
                      <Text
                        style={{ color: 'rgba(255, 255, 255, 0.75)' }}
                        className="font-label text-[10px] font-bold uppercase tracking-wider"
                      >
                        INCOME
                      </Text>
                    </View>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                      style={{ color: '#4ade80' }}
                      className="text-lg font-bold font-headline tracking-tight"
                    >
                      {hideBalances ? "₵ ••••" : formatGHS(income)}
                    </Text>
                  </View>

                  {/* Spent Glass Capsule */}
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      borderColor: 'rgba(255, 255, 255, 0.12)',
                      borderWidth: 1,
                      borderRadius: 18,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                    }}
                  >
                    <View className="flex-row items-center mb-1">
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: 'rgba(248, 113, 113, 0.2)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 6,
                        }}
                      >
                        <ArrowDownRight size={12} color="#f87171" strokeWidth={2.5} />
                      </View>
                      <Text
                        style={{ color: 'rgba(255, 255, 255, 0.75)' }}
                        className="font-label text-[10px] font-bold uppercase tracking-wider"
                      >
                        SPENT
                      </Text>
                    </View>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                      style={{ color: '#f87171' }}
                      className="text-lg font-bold font-headline tracking-tight"
                    >
                      {hideBalances ? "₵ ••••" : formatGHS(expense)}
                    </Text>
                  </View>
                </View>

                {/* Safe to Spend Today Dynamic Budget Metric */}
                {safeToSpendToday && (
                  <View
                    style={{
                      marginTop: 14,
                      backgroundColor:
                        safeToSpendToday.status === 'healthy'
                          ? 'rgba(74, 222, 128, 0.12)'
                          : safeToSpendToday.status === 'moderate'
                            ? 'rgba(251, 191, 36, 0.12)'
                            : 'rgba(244, 63, 94, 0.12)',
                      borderColor:
                        safeToSpendToday.status === 'healthy'
                          ? 'rgba(74, 222, 128, 0.3)'
                          : safeToSpendToday.status === 'moderate'
                            ? 'rgba(251, 191, 36, 0.3)'
                            : 'rgba(244, 63, 94, 0.3)',
                      borderWidth: 1,
                      borderRadius: 18,
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}>
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          backgroundColor:
                            safeToSpendToday.status === 'healthy'
                              ? 'rgba(74, 222, 128, 0.25)'
                              : safeToSpendToday.status === 'moderate'
                                ? 'rgba(251, 191, 36, 0.25)'
                                : 'rgba(244, 63, 94, 0.25)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 10,
                          flexShrink: 0,
                        }}
                      >
                        <Zap
                          size={14}
                          color={
                            safeToSpendToday.status === 'healthy'
                              ? '#4ade80'
                              : safeToSpendToday.status === 'moderate'
                                ? '#fbbf24'
                                : '#f43f5e'
                          }
                        />
                      </View>
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.85}
                          style={{ color: 'rgba(255, 255, 255, 0.88)', letterSpacing: 0.6 }}
                          className="text-[10px] font-bold font-label uppercase"
                        >
                          Safe to Spend Today
                        </Text>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                          style={{ color: 'rgba(255, 255, 255, 0.65)', marginTop: 2 }}
                          className="text-[11px] font-medium"
                        >
                          {safeToSpendToday.daysLeft} {safeToSpendToday.daysLeft === 1 ? 'day' : 'days'} left • {hideBalances ? "₵ ••••" : formatGHS(safeToSpendToday.remaining)} left
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color:
                            safeToSpendToday.status === 'healthy'
                              ? '#4ade80'
                              : safeToSpendToday.status === 'moderate'
                                ? '#fbbf24'
                                : '#f43f5e',
                          fontSize: 15,
                          fontWeight: '800',
                        }}
                      >
                        {hideBalances ? "₵ ••••" : formatGHS(safeToSpendToday.dailyAllowance)}
                      </Text>
                      <Text
                        style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 10, fontWeight: '600', marginTop: 1 }}
                      >
                        per day
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </GlassSurface>

          {/* Plain-Language Quick Actions */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32, gap: 8 }}>
            <GlassButton size={56} radius={20} caption="Add Expense" accessibilityLabel="Add expense or income" onPress={() => navigation.navigate('AddTransaction')} style={{ flex: 1 }}>
              <Plus size={24} color={isDark ? '#a4f3b9' : '#0d631b'} />
            </GlassButton>
            <GlassButton size={56} radius={20} caption="Import SMS" accessibilityLabel="Import MoMo SMS alert" onPress={() => navigation.navigate('AddTransaction', { openAiPaste: true })} style={{ flex: 1 }}>
              <Sparkles size={22} color={isDark ? '#f6c875' : '#996000'} />
            </GlassButton>
            <GlassButton size={56} radius={20} caption="Accounts" accessibilityLabel="Open accounts" onPress={() => navigation.navigate('Accounts')} style={{ flex: 1 }}>
              <Landmark size={22} color={isDark ? '#b4b9ff' : '#4c56af'} />
            </GlassButton>
            <GlassButton size={56} radius={20} caption="MoMo Codes" accessibilityLabel="Open mobile money USSD codes" onPress={() => ussdSheetRef.current?.snapToIndex(0)} style={{ flex: 1 }}>
              <Smartphone size={22} color={isDark ? '#7cdbcb' : '#096b59'} />
            </GlassButton>
          </View>

          {/* Monthly Budgets Section */}
          <View className="mb-10">
            <View className="flex-row justify-between items-center mb-4">
              <Text className={`text-xl font-headline font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Monthly Budgets</Text>
              <GlassButton
                size={36}
                accessibilityLabel="Open budgets"
                onPress={() => navigation.navigate('BudgetsTab')}
              >
                <Plus size={18} color={theme === 'dark' ? '#e1e3e0' : '#0d631b'} />
              </GlassButton>
            </View>

            {!budgets || budgets.length === 0 ? (
              <GlassSurface radius={28}>
                <View className="p-6 items-center">
                  <Text className={`font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base mb-1.5`}>No monthly budgets yet</Text>
                  <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs text-center leading-relaxed mb-4`}>
                    Set a monthly spending limit for food, transport, or bills to stay on track.
                  </Text>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('BudgetsTab')}
                    className="px-4 py-2.5 rounded-xl bg-primary/15 border border-primary/25"
                  >
                    <Text className={`text-xs font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>Create a Budget</Text>
                  </TouchableOpacity>
                </View>
              </GlassSurface>
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

          {/* Recent Activity Section */}
          <View className="mb-10">
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-row items-center space-x-2">
                <Text className={`text-xl font-headline font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Recent Activity</Text>
                <TouchableOpacity 
                  onPress={() => {
                    clearAllFilters();
                    ledgerSheetRef.current?.snapToIndex(0);
                  }}
                  className="p-1 rounded-full active:bg-gray-100 dark:active:bg-dark-surface-container-low"
                >
                  <Search size={18} color={isDark ? '#e1e3e0' : '#1C1C2E'} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  clearAllFilters();
                  ledgerSheetRef.current?.snapToIndex(0);
                }}
              >
                <Text className={`text-xs font-bold font-label uppercase tracking-wider ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>View All</Text>
              </TouchableOpacity>
            </View>

            {/* Pending Offline Queue Banner & Cards */}
            {offlineQueue.length > 0 && (
              <View className="mb-4">
                <View className={`flex-row items-center justify-between px-4 py-2.5 rounded-2xl mb-2 ${isDark ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'}`}>
                  <View className="flex-row items-center flex-1 mr-2">
                    <Clock size={15} color="#f59e0b" />
                    <Text className={`ml-2 text-xs font-bold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                      {offlineQueue.length} offline {offlineQueue.length === 1 ? 'transaction' : 'transactions'} waiting for internet
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => syncTransactions()}
                    className="flex-row items-center px-3 py-1.5 rounded-xl bg-amber-500"
                  >
                    <RefreshCw size={12} color="#fff" />
                    <Text className="text-white text-[11px] font-bold ml-1">Sync Now</Text>
                  </TouchableOpacity>
                </View>

                {offlineQueue.map((queued: any) => (
                  <GlassSurface key={queued.client_id} radius={22} style={{ marginBottom: 10 }}>
                    <View className="flex-row items-center justify-between p-4">
                      <View className="flex-row items-center flex-1 mr-3">
                        <View className="w-10 h-10 rounded-full bg-amber-500/15 items-center justify-center mr-3">
                          <Clock size={18} color="#f59e0b" />
                        </View>
                        <View className="flex-1">
                          <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`} numberOfLines={1}>
                            {queued.description || queued.category_name || 'Offline Transaction'}
                          </Text>
                          <Text className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                            Waiting for internet • {queued.transaction_date}
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row items-center">
                        <Text className={`font-headline font-bold text-sm mr-3 ${queued.transaction_type === 'income' ? 'text-success' : 'text-error'}`}>
                          {queued.transaction_type === 'income' ? '+' : '-'}{formatGHS(queued.amount)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => removeOfflineTransactions([queued.client_id])}
                          className="p-1.5 rounded-full bg-red-500/10"
                        >
                          <Trash2 size={14} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </GlassSurface>
                ))}
              </View>
            )}

            {isTransactionsLoading ? (
              <ActivityIndicator size="large" color="#0d631b" className="py-8" />
            ) : transactions.length === 0 && offlineQueue.length === 0 ? (
              <GlassSurface radius={28}>
                <View className="p-7 items-center">
                  <Text className={`font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base mb-1.5`}>No transactions recorded yet</Text>
                  <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs text-center leading-relaxed mb-4`}>
                    Record your first cash, MoMo, or bank expense to start seeing your daily spending breakdown.
                  </Text>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('AddTransaction')}
                    className="px-5 py-3 rounded-2xl bg-primary flex-row items-center"
                  >
                    <Plus size={16} color="#fff" />
                    <Text className="text-white text-xs font-bold ml-1.5">Record Your First Expense</Text>
                  </TouchableOpacity>
                </View>
              </GlassSurface>
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
      <GlassButton
        accessibilityLabel="Add transaction"
        onPress={() => navigation.navigate('AddTransaction')}
        size={60} elevated
        style={{ position: 'absolute', bottom: tabBarClearance, right: 24, zIndex: 30 }}
      >
        <Plus color={isDark ? '#a4f3b9' : '#0d631b'} size={30} />
      </GlassButton>

      {/* 5-Second Swipe Delete Undo Toast */}
      {undoTx && (
        <View
          style={{
            position: 'absolute',
            bottom: tabBarClearance + 20,
            left: 16,
            right: 16,
            backgroundColor: isDark ? 'rgba(31, 41, 55, 0.96)' : 'rgba(17, 24, 39, 0.96)',
            borderRadius: 18,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 10,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.15)',
            zIndex: 40,
          }}
        >
          <View className="flex-row items-center flex-1 mr-3">
            <View className="w-8 h-8 rounded-full bg-rose-500/20 items-center justify-center mr-2.5">
              <Trash2 size={16} color="#f43f5e" />
            </View>
            <View>
              <Text className="text-white font-bold text-xs" numberOfLines={1}>
                Deleted {undoTx.tx.description || 'Transaction'} ({formatGHS(undoTx.tx.amount)})
              </Text>
              <Text className="text-white/60 text-[10px]">
                Undo available for {undoTx.secondsLeft}s
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleUndoDelete}
            className="bg-emerald-500 px-3.5 py-2 rounded-xl flex-row items-center active:bg-emerald-600"
          >
            <RotateCcw size={14} color="#fff" />
            <Text className="text-white font-bold text-xs ml-1.5">Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* USSD Helper Sheet */}
      <BottomSheet
        ref={ussdSheetRef}
        index={-1}
        snapPoints={['68%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}>
          <View className="px-6 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>USSD Quick Codes</Text>
              <TouchableOpacity onPress={() => ussdSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs mb-6 leading-relaxed`}>
              Quickly dial Mobile Money operator codes. On compatible mobile devices, this will dial automatically.
            </Text>

            <View>
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
                <View
                  key={idx}
                  style={[
                    styles.sheetSolidCard,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.03)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.06)',
                    },
                  ]}
                >
                  <TouchableOpacity 
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
                    className="flex-row items-center p-5"
                  >
                    {op.logo}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View className="flex-row justify-between items-baseline mb-1">
                        <Text className={`font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base`} numberOfLines={1}>{op.name}</Text>
                        <Text className={`font-headline font-black ${isDark ? 'text-[#4ade80]' : 'text-primary'} text-sm ml-2`}>{op.code}</Text>
                      </View>
                      <Text className={`${isDark ? 'text-gray-300' : 'text-gray-500'} text-xs leading-relaxed`}>{op.desc}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Profile Status Sheet */}
      <BottomSheet
        ref={profileSheetRef}
        index={-1}
        snapPoints={['75%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}>
          <View className="px-6 py-4 items-center">
            <View className="w-full flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>My Status</Text>
              <TouchableOpacity onPress={() => profileSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Profile Avatar Card */}
            <GlassSurface solidFallback radius={26} style={{ width: '100%', marginBottom: 20 }}>
              <View className="p-6 items-center">
                <TouchableOpacity onPress={handleAvatarPress} className="relative mb-4">
                  <View className={`w-20 h-20 rounded-full bg-primary-container overflow-hidden border-2 ${isDark ? 'border-[#4ade80]/40' : 'border-primary/20'}`}>
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
                        ? isDark ? 'text-[#4ade80]' : 'text-success' 
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
                      className={`flex-1 items-center justify-center p-4 rounded-2xl border ${isDark ? 'bg-white/5 border-white/15' : 'bg-gray-100 border-gray-200'} active:scale-95 transition-all shadow-sm`}
                    >
                      <Award size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
                      <Text className={`font-label font-bold text-[9px] uppercase tracking-wider text-center mt-2.5 ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Free Tier\n(Upgrade)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </GlassSurface>

            {/* Benefits Info */}
            <GlassSurface solidFallback radius={22} style={{ width: '100%', marginBottom: 20 }}>
              <View className="p-5">
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
            </GlassSurface>

            {/* Quick AI Support Card */}
            <GlassSurface solidFallback radius={22} style={{ width: '100%', marginBottom: 20 }}>
              <TouchableOpacity
                onPress={() => {
                  profileSheetRef.current?.close();
                  setIsSupportModalVisible(true);
                }}
                className="flex-row items-center p-4"
              >
                <View className="w-10 h-10 rounded-xl bg-primary/15 items-center justify-center mr-3">
                  <Sparkles size={20} color={isDark ? '#4ade80' : '#0d631b'} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className={`font-headline font-bold text-sm ${isDark ? 'text-white' : 'text-charcoal'}`}>
                    AI Support & Diagnostics
                  </Text>
                  <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Ask questions, check for problems, or auto-log SMS
                  </Text>
                </View>
              </TouchableOpacity>
            </GlassSurface>

            {/* Multi-Profile Switcher Section */}
            {savedAccounts.length > 1 && (
              <View className="w-full mb-6">
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3 ml-1`}>
                  Switch Profile
                </Text>
                {savedAccounts
                  .filter((acc) => acc.phone !== user?.phone)
                  .map((acc) => (
                    <GlassSurface solidFallback key={acc.phone} radius={20} style={{ marginBottom: 8 }}>
                      <View className="flex-row items-center justify-between p-4">
                        <View className="flex-row items-center flex-1 mr-3">
                          <View className="w-10 h-10 rounded-full bg-primary/15 items-center justify-center mr-3 overflow-hidden">
                            {accountAvatars[acc.phone] ? (
                              <Image 
                                source={{ uri: accountAvatars[acc.phone] }} 
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                              />
                            ) : (
                              <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-headline font-bold text-sm`}>
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
                                'Remove Saved Profile',
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
                    </GlassSurface>
                  ))}
              </View>
            )}

            {/* Add Profile Option */}
            <TouchableOpacity
              onPress={handleAddAccount}
              className={`w-full py-4 border-2 border-dashed ${
                isDark ? 'border-[#4ade80]/40 bg-[#1f2920]' : 'border-primary/30 bg-primary/5'
              } rounded-2xl items-center justify-center mb-6 flex-row space-x-2`}
            >
              <Plus size={18} color={isDark ? '#4ade80' : '#16a34a'} />
              <Text className={`font-headline font-bold text-sm ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>
                Add Another Profile
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
              <Text className="text-white font-headline font-bold text-base">Open Settings</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Full Transaction History Sheet */}
      <BottomSheet
        ref={ledgerSheetRef}
        index={-1}
        snapPoints={['88%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="px-6 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <View>
                <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>All Transactions</Text>
                {totalServerTransactions > 0 && (
                  <Text className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                    Showing {filteredTransactions.length} of {totalServerTransactions} total
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => ledgerSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Search Input Row with Filter Toggle */}
            <View className="flex-row items-center mb-4">
              <View className={`flex-1 flex-row items-center ${isDark ? 'bg-black/25 border-white/15' : 'bg-white/70 border-gray-200'} rounded-2xl border px-4 py-3 mr-3 shadow-sm`}>
                <Search size={20} color={isDark ? '#e1e3e0' : '#6B7280'} className="mr-3" />
                <BottomSheetTextInput
                  className={`flex-1 font-body text-base ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} p-0`}
                  placeholder="Search note, category, amount..."
                  placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={Keyboard.dismiss}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                    <X size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`p-3.5 rounded-2xl border ${
                  showAdvancedFilters 
                    ? 'bg-primary border-primary' 
                    : isDark ? 'bg-black/25 border-white/15' : 'bg-white/70 border-gray-200'
                } active:scale-95 transition-all shadow-sm`}
              >
                <SlidersHorizontal size={20} color={showAdvancedFilters ? 'white' : (isDark ? '#e1e3e0' : '#6B7280')} />
              </TouchableOpacity>
            </View>

            {/* Filter Pills + Always-visible Clear Filters */}
            <View className="flex-row items-center justify-between mb-6">
              <View className="flex-row space-x-2">
                {(['all', 'income', 'expense'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setFilterType(type)}
                    className={`px-4 py-2.5 rounded-full border ${
                      filterType === type 
                        ? 'bg-primary border-primary shadow-sm shadow-primary/20' 
                        : isDark ? 'bg-black/25 border-white/10' : 'bg-white/70 border-gray-200'
                    }`}
                  >
                    <Text className={`font-label text-xs font-bold capitalize ${filterType === type ? 'text-white' : isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {hasActiveFilters && (
                <TouchableOpacity
                  onPress={clearAllFilters}
                  className="px-3.5 py-2 rounded-full bg-error/15 border border-error/25"
                >
                  <Text className="text-error font-headline font-bold text-xs">Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Collapsible Advanced Filters Panel */}
            {showAdvancedFilters && (
              <GlassSurface radius={24} style={{ marginBottom: 24 }}>
                <View className="p-5">
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
                              : isDark ? 'bg-black/25 border-white/15' : 'bg-white border-gray-200'
                          }`}
                        >
                          <Text className={`font-label text-[11px] font-bold ${
                            filterDateRange === item.value ? (isDark ? 'text-[#4ade80]' : 'text-primary') : (isDark ? 'text-gray-300' : 'text-gray-600')
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
                            : isDark ? 'bg-black/25 border-white/15' : 'bg-white border-gray-200'
                        }`}
                      >
                        <Text className={`font-label text-[11px] font-bold ${
                          filterCategory === null ? (isDark ? 'text-[#4ade80]' : 'text-primary') : (isDark ? 'text-gray-300' : 'text-gray-600')
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
                              : isDark ? 'bg-black/25 border-white/15' : 'bg-white border-gray-200'
                          }`}
                        >
                          <Text className={`font-label text-[11px] font-bold ${
                            filterCategory === cat.id ? (isDark ? 'text-[#4ade80]' : 'text-primary') : (isDark ? 'text-gray-300' : 'text-gray-600')
                          }`}>
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Account Source Selector */}
                  <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3`}>
                    Paid With / Account
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                    <View className="flex-row space-x-2">
                      <TouchableOpacity
                        onPress={() => setFilterAccount(null)}
                        className={`px-4 py-2 rounded-xl border ${
                          filterAccount === null
                            ? 'bg-primary/20 border-primary/50'
                            : isDark ? 'bg-black/25 border-white/15' : 'bg-white border-gray-200'
                        }`}
                      >
                        <Text className={`font-label text-[11px] font-bold ${
                          filterAccount === null ? (isDark ? 'text-[#4ade80]' : 'text-primary') : (isDark ? 'text-gray-300' : 'text-gray-600')
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
                              : isDark ? 'bg-black/25 border-white/15' : 'bg-white border-gray-200'
                          }`}
                        >
                          <Text className={`font-label text-[11px] font-bold ${
                            filterAccount === acc.id ? (isDark ? 'text-[#4ade80]' : 'text-primary') : (isDark ? 'text-gray-300' : 'text-gray-600')
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
                    <View className={`flex-1 flex-row items-center ${isDark ? 'bg-black/25 border-white/15' : 'bg-white border-gray-200'} rounded-xl border px-3 py-2 shadow-sm`}>
                      <Text className={`text-xs font-bold mr-1.5 ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Min:</Text>
                      <TextInput
                        className={`flex-1 font-body text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} p-0`}
                        placeholder="0.00"
                        placeholderTextColor="#9CA3AF"
                        value={filterMinAmount}
                        onChangeText={setFilterMinAmount}
                        keyboardType="numeric"
                      />
                    </View>
                    <View className={`flex-1 flex-row items-center ${isDark ? 'bg-black/25 border-white/15' : 'bg-white border-gray-200'} rounded-xl border px-3 py-2 shadow-sm`}>
                      <Text className={`text-xs font-bold mr-1.5 ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Max:</Text>
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
                    <Text className={`text-xs font-body ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                      {filteredTransactions.length} results matching
                    </Text>
                    <TouchableOpacity
                      onPress={clearAllFilters}
                      className="flex-row items-center space-x-1.5 bg-error/10 px-4 py-2 rounded-xl"
                    >
                      <Text className="text-error font-headline font-bold text-xs">Reset All</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassSurface>
            )}

            {/* Transactions List */}
            {isAllTransactionsLoading ? (
              <ActivityIndicator size="large" color={isDark ? '#4ade80' : '#0d631b'} className="py-12" />
            ) : filteredTransactions.length === 0 ? (
              <View className="items-center py-12">
                <Text className={`font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-base mb-1`}>No transactions found</Text>
                <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs text-center mb-4`}>
                  Try adjusting your search query or clearing active filters.
                </Text>
                {hasActiveFilters && (
                  <TouchableOpacity
                    onPress={clearAllFilters}
                    className="px-4 py-2.5 rounded-xl bg-primary/15 border border-primary/25"
                  >
                    <Text className={`text-xs font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>Clear Filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View className="space-y-1">
                {filteredTransactions.map((item: any) => (
                  <View key={item.id}>
                    {renderTransactionItem({ item })}
                  </View>
                ))}

                {allTransactions.length < totalServerTransactions && (
                  <TouchableOpacity
                    onPress={handleLoadMoreTransactions}
                    disabled={isLoadingMore}
                    className={`mt-4 py-3.5 rounded-2xl items-center justify-center border ${
                      isDark ? 'bg-white/10 border-white/15' : 'bg-black/5 border-black/10'
                    }`}
                  >
                    {isLoadingMore ? (
                      <ActivityIndicator size="small" color={isDark ? '#4ade80' : '#0d631b'} />
                    ) : (
                      <Text className={`font-headline font-bold text-xs ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>
                        Load More Transactions ({totalServerTransactions - allTransactions.length} remaining)
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Transaction Detail / Edit / Delete Sheet */}
      <BottomSheet
        ref={editTxSheetRef}
        index={-1}
        snapPoints={['76%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundComponent={GlassSheetBackground}
        onClose={() => {
          Keyboard.dismiss();
          setSelectedTx(null);
        }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View className="px-6 py-4">
              <View className="flex-row justify-between items-center mb-5">
                <View className="flex-row items-center">
                  <Edit3 size={18} color={isDark ? '#4ade80' : '#0d631b'} />
                  <Text className={`ml-2 text-xl font-headline font-bold ${isDark ? 'text-white' : 'text-charcoal'}`}>
                    Edit Transaction
                  </Text>
                </View>
                <TouchableOpacity onPress={closeEditTransactionSheet} className="p-1">
                  <X size={20} color={isDark ? '#9ca3af' : '#6b7280'} />
                </TouchableOpacity>
              </View>

              {/* Amount */}
              <Text className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1.5`}>
                Amount (GH₵)
              </Text>
              <View className={`flex-row items-center px-4 py-3 rounded-2xl border mb-4 ${isDark ? 'bg-black/30 border-white/15' : 'bg-white border-gray-200'}`}>
                <Text className="text-lg font-bold text-primary mr-2">₵</Text>
                <BottomSheetTextInput
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  className={`flex-1 text-xl font-headline font-bold ${isDark ? 'text-white' : 'text-charcoal'} p-0`}
                />
              </View>

              {/* Note / Description */}
              <Text className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1.5`}>
                Note / Description
              </Text>
              <View className={`flex-row items-center px-4 py-3 rounded-2xl border mb-4 ${isDark ? 'bg-black/30 border-white/15' : 'bg-white border-gray-200'}`}>
                <BottomSheetTextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="What was this for?"
                  placeholderTextColor="#9ca3af"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  className={`flex-1 font-body text-sm ${isDark ? 'text-white' : 'text-charcoal'} p-0`}
                />
              </View>

              {/* Date */}
              <View className="flex-row justify-between items-center mb-1.5">
                <Text className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Date (YYYY-MM-DD)
                </Text>
                <View className="flex-row space-x-2">
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      setEditDate(new Date().toISOString().split('T')[0]);
                    }}
                    className={`px-2.5 py-1 rounded-lg border ${isDark ? 'bg-black/20 border-white/10' : 'bg-gray-100 border-gray-200'}`}
                  >
                    <Text className={`text-[10px] font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      setEditDate(d.toISOString().split('T')[0]);
                    }}
                    className={`px-2.5 py-1 rounded-lg border ${isDark ? 'bg-black/20 border-white/10' : 'bg-gray-100 border-gray-200'}`}
                  >
                    <Text className={`text-[10px] font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>Yesterday</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View className={`flex-row items-center px-4 py-3 rounded-2xl border mb-4 ${isDark ? 'bg-black/30 border-white/15' : 'bg-white border-gray-200'}`}>
                <Calendar size={16} color={isDark ? '#9ca3af' : '#6b7280'} style={{ marginRight: 8 }} />
                <BottomSheetTextInput
                  value={editDate}
                  onChangeText={setEditDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  className={`flex-1 font-body text-sm ${isDark ? 'text-white' : 'text-charcoal'} p-0`}
                />
              </View>

              {/* Category Selector Chips */}
              {categories && categories.length > 0 && (
                <View className="mb-6">
                  <Text className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2`}>
                    Category
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {categories
                      .filter((c: any) => !selectedTx || c.category_type === selectedTx.transaction_type)
                      .map((cat: any) => {
                        const active = editCategoryId === cat.id || (!editCategoryId && selectedTx?.category?.name === cat.name);
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            onPress={() => {
                              Keyboard.dismiss();
                              setEditCategoryId(cat.id);
                            }}
                            className={`mr-2 px-3.5 py-2 rounded-xl border ${
                              active
                                ? 'bg-primary border-primary'
                                : isDark ? 'bg-black/25 border-white/15' : 'bg-white border-gray-200'
                            }`}
                          >
                            <Text className={`text-xs font-bold ${active ? 'text-white' : isDark ? 'text-gray-300' : 'text-charcoal'}`}>
                              {cat.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>
              )}

              {/* Action Buttons */}
              <View className="flex-row space-x-3 mt-2">
                <TouchableOpacity
                  onPress={handleDeleteTransaction}
                  disabled={isSavingTx}
                  className="px-4 py-4 rounded-2xl bg-error/15 border border-error/30 flex-row items-center justify-center"
                >
                  <Trash2 size={18} color="#ef4444" />
                  <Text className="text-error font-headline font-bold text-sm ml-1.5">Delete</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveTransactionEdit}
                  disabled={isSavingTx}
                  className="flex-1 py-4 rounded-2xl bg-primary items-center justify-center shadow-lg shadow-primary/25"
                >
                  {isSavingTx ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-white font-headline font-bold text-base">Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
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
        <View className="flex-1 justify-end bg-black/65">
          <GlassSurface
            variant="thick"
            elevated
            radius={32}
            style={{ width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32, alignItems: 'center' }}
          >
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
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-sm`}>Cancel</Text>
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
                  className={`w-3.5 h-3.5 rounded-full border-2 ${isDark ? 'border-[#4ade80]' : 'border-primary'} ${
                    i < switchPin.length ? (isDark ? 'bg-[#4ade80]' : 'bg-primary') : 'bg-transparent'
                  }`}
                />
              ))}
            </View>

            {/* Error Message */}
            {switchError ? (
              <Text className="text-error text-xs font-semibold mb-6 text-center">{switchError}</Text>
            ) : null}

            {/* PIN Pad */}
            <View className="w-full pb-2">
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
          </GlassSurface>
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

      {/* Anchored Top-Bar AI Support Speech Bubble Tooltip */}
      <TopBarSupportTooltip
        userName={user?.full_name}
        screenContext="dashboard"
        arrowRightOffset={74}
        topOffset={74}
        onOpenSupport={(opts) => {
          setStartFreshSupport(!!opts?.startNewChat);
          setIsSupportModalVisible(true);
        }}
      />

      {/* AI Support Modal */}
      <SupportModal
        visible={isSupportModalVisible}
        onClose={() => {
          setIsSupportModalVisible(false);
          refetchSummary();
          refetchTransactions();
          refetchAccounts();
          refetchBudgets();
          refetchAllTransactions();
        }}
        phone={user?.phone}
        userName={user?.full_name}
        screenContext="dashboard"
        navigation={navigation}
        startNewChatOnOpen={startFreshSupport}
      />

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  transactionItemCard: {
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  sheetSolidCard: {
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
});

export default DashboardScreen;
