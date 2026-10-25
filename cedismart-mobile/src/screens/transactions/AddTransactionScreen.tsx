import React, { useState, useRef, useEffect } from 'react';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassSurface } from '../../components/glass/GlassSurface';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import BottomSheet from '@gorhom/bottom-sheet';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronRight, Calendar, ArrowLeft, Wallet, Tag, Receipt, CheckCircle, Sparkles, X, Plus } from 'lucide-react-native';
import AccountPicker from '../../components/shared/AccountPicker';
import CategoryPicker from '../../components/shared/CategoryPicker';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { useOfflineStore } from '../../stores/offlineStore';
import { useThemeStore } from '../../stores/themeStore';
import NetInfo from '@react-native-community/netinfo';
import apiClient from '../../api/client';
import uuid from 'react-native-uuid';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { triggerLocalNotification } from '../../utils/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

type TransactionForm = {
  amount: string;
  transaction_type: 'income' | 'expense';
  account_id: string;
  category_id: string;
  description: string;
  transaction_date: string;
};

const toDateString = (d: Date) => d.toISOString().split('T')[0];

const formatSelectedDateLabel = (dateStr: string) => {
  const todayStr = toDateString(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateString(yesterday);

  const parsed = new Date(`${dateStr}T12:00:00`);
  const formatted = isNaN(parsed.getTime())
    ? dateStr
    : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: parsed.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });

  if (dateStr === todayStr) return `Today, ${formatted}`;
  if (dateStr === yesterdayStr) return `Yesterday, ${formatted}`;
  return formatted;
};

const AddTransactionScreen = ({ navigation, route }: any) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const accountSheetRef = useRef<BottomSheet>(null);
  const categorySheetRef = useRef<BottomSheet>(null);
  const [accountName, setAccountName] = useState('Select Account');
  const [categoryName, setCategoryName] = useState('Select Category');
  const [categoryColor, setCategoryColor] = useState('#707a6c');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { addTransaction } = useOfflineStore();
  const queryClient = useQueryClient();

  const { control, handleSubmit, watch, setValue } = useForm<TransactionForm>({
    defaultValues: {
      amount: '',
      transaction_type: 'expense',
      account_id: '',
      category_id: '',
      description: '',
      transaction_date: toDateString(new Date()),
    }
  });

  const transactionType = watch('transaction_type');
  const selectedAccountId = watch('account_id');
  const selectedDateStr = watch('transaction_date');

  const [showAiPaste, setShowAiPaste] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [isParsingSms, setIsParsingSms] = useState(false);

  const [showDateOptions, setShowDateOptions] = useState(false);
  const [showNativeDatePicker, setShowNativeDatePicker] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  useEffect(() => {
    if (route.params?.openAiPaste) {
      setShowAiPaste(true);
    }
  }, [route.params?.openAiPaste]);

  const user = useAuthStore((state) => state.user);

  const { data: accounts } = useQuery<any[]>({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/accounts/');
      return response.data;
    },
    enabled: !!user?.id,
  });

  // Auto-select last used account or default Cash/first account
  useEffect(() => {
    if (!accounts || accounts.length === 0 || selectedAccountId) return;
    let isMounted = true;
    AsyncStorage.getItem('last_used_account_id').then((lastId) => {
      if (!isMounted) return;
      const remembered = lastId ? accounts.find((a: any) => a.id === lastId) : null;
      const cashAccount = accounts.find((a: any) => a.account_type === 'cash');
      const fallback = remembered || cashAccount || accounts[0];
      if (fallback) {
        setValue('account_id', fallback.id);
        setAccountName(fallback.name);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [accounts, selectedAccountId, setValue]);

  const { data: categories } = useQuery<any[]>({
    queryKey: ['categories', transactionType, user?.id],
    queryFn: async () => {
      const response = await apiClient.get(`/categories/?type=${transactionType}`);
      return response.data;
    },
    enabled: !!transactionType && !!user?.id,
  });

  const handleParseSMS = async () => {
    if (!smsText.trim()) return;
    setIsParsingSms(true);
    Haptics.selectionAsync().catch(() => {});
    
    try {
      const response = await apiClient.post('/transactions/parse-sms', { sms: smsText });
      const parsed = response.data;
      
      if (parsed) {
        setValue('amount', String(parsed.amount));
        setValue('transaction_type', parsed.transaction_type);
        setValue('description', parsed.description);
        
        if (parsed.category_id) {
          setValue('category_id', parsed.category_id);
          setCategoryName(parsed.category_name);
          
          const matched = categories?.find((c: any) => c.id === parsed.category_id);
          if (matched) {
            setCategoryColor(matched.color || '#707a6c');
          }
        }
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setSmsText('');
        setShowAiPaste(false);
        Alert.alert('Autofill Successful', 'Transaction details pre-filled! Please review before saving.');
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      console.warn('SMS Parsing failed:', err);
      Alert.alert('Parsing Failed', 'Could not parse the SMS. Please check format or input manually.');
    } finally {
      setIsParsingSms(false);
    }
  };

  const handleAddInlineTag = () => {
    const clean = tagInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput('');
  };

  const handleAttachReceipt = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Please grant photo library permissions.');
      return;
    }

    Alert.alert(
      'Attach Receipt',
      'Choose source:',
      [
        {
          text: 'Camera',
          onPress: async () => {
            const cam = await ImagePicker.requestCameraPermissionsAsync();
            if (cam.status !== 'granted') {
              Alert.alert('Permission Denied', 'Camera permission required.');
              return;
            }
            const res = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.8,
            });
            if (!res.canceled && res.assets[0].uri) {
              setReceiptImage(res.assets[0].uri);
            }
          }
        },
        {
          text: 'Photo Library',
          onPress: async () => {
            const res = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.8,
            });
            if (!res.canceled && res.assets[0].uri) {
              setReceiptImage(res.assets[0].uri);
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handleAmountChange = (text: string, onChange: (value: string) => void) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    if ((cleaned.match(/\./g) || []).length > 1) return;
    onChange(cleaned);
  };

  const onSubmit = async (data: TransactionForm) => {
    const numericAmount = parseFloat(data.amount);
    
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter an amount greater than 0.');
      return;
    }
    if (!data.account_id) {
      Alert.alert('Missing Info', 'Please select which account you paid with.');
      return;
    }
    if (!data.category_id) {
      Alert.alert('Missing Info', 'Please select a category.');
      return;
    }

    setIsSubmitting(true);

    // Also extract any #hashtags from description
    const hashtagMatches = (data.description || '').match(/#([a-zA-Z0-9_-]+)/g) || [];
    const extractedTags = hashtagMatches.map((t) => t.slice(1).toLowerCase());
    const mergedTags = Array.from(new Set([...tags, ...extractedTags]));

    const notesPayload = JSON.stringify({
      tags: mergedTags,
      receipt: receiptImage || undefined
    });

    const payload = {
      ...data,
      amount: numericAmount,
      client_id: uuid.v4().toString(),
      notes: notesPayload,
    };

    try {
      const netState = await NetInfo.fetch();
      
      if (netState.isConnected && netState.isInternetReachable) {
        await apiClient.post('/transactions/', payload);
        await AsyncStorage.setItem('pending_confetti', 'true');
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['budgets'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['reports'] });
        
        // Trigger budget alert check if notifications are enabled
        const user = useAuthStore.getState().user;
        if (user?.id) {
          AsyncStorage.getItem(`budget_alerts_enabled_${user.id}`).then(async (alertsEnabled) => {
            if (alertsEnabled === 'true') {
              const thresholdStr = await AsyncStorage.getItem(`budget_alert_threshold_${user.id}`);
              const threshold = thresholdStr ? parseFloat(thresholdStr) : 0.8;
              try {
                const budgetsResponse = await apiClient.get('/budgets/');
                const budgets = budgetsResponse.data;
                const matchedBudget = budgets.find((b: any) => b.category?.id === payload.category_id);
                if (matchedBudget) {
                  const spent = parseFloat(matchedBudget.spent_amount);
                  const limit = parseFloat(matchedBudget.budgeted_amount);
                  if (limit > 0) {
                    const ratio = spent / limit;
                    const alertAtThreshold = matchedBudget.alert_at_percent ? (matchedBudget.alert_at_percent / 100) : threshold;
                    if (ratio >= 1.0) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                      await triggerLocalNotification(
                        'Budget Limit Exceeded! ⚠️',
                        `You have spent ₵${spent.toFixed(2)} of your ₵${limit.toFixed(2)} budget on ${matchedBudget.category?.name || 'this category'}.`
                      );
                    } else if (ratio >= alertAtThreshold) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                      await triggerLocalNotification(
                        'Budget Limit Warning! 🔔',
                        `You have used ${Math.round(ratio * 100)}% of your budget on ${matchedBudget.category?.name || 'this category'}.`
                      );
                    }
                  }
                }
              } catch (err) {
                console.warn('Failed to check budget alert:', err);
              }
            }
          });
        }

        Alert.alert('Success', 'Transaction saved!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        addTransaction({
          ...payload,
          account_name: accountName,
          category_name: categoryName,
          queued_at: new Date().toISOString(),
        });
        
        Alert.alert('Saved Offline', 'Transaction saved on your device and will sync automatically when you are back online.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Failed to save transaction.';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
      <CoinBackground />
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 z-50">
        <View className="flex-row items-center space-x-4">
          <GlassButton accessibilityLabel="Close add transaction" onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
            <ArrowLeft size={22} color={isDark ? '#a4f3b9' : '#0d631b'} />
          </GlassButton>
          <Text className={`text-xl font-headline font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight`}>Add Transaction</Text>
        </View>
        <GlassSurface variant="clear" radius={16} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-300' : 'text-outline'}`}>₵ GHANA CEDI</Text>
        </GlassSurface>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View className="px-6 pt-6 pb-36">
            
            {/* AI SMS Autofill Toggle */}
            <View className="mb-6">
              <View
                style={[
                  styles.formFieldCard,
                  {
                    backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : 'rgba(255, 255, 255, 0.96)',
                    borderColor: isDark ? 'rgba(164, 243, 185, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowAiPaste(!showAiPaste);
                  }}
                  activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, width: '100%' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 12 }}>
                    <View className={`p-2 rounded-xl ${isDark ? 'bg-primary/20' : 'bg-primary/10'}`} style={{ marginRight: 12 }}>
                      <Sparkles size={18} color="#10b981" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text className={`font-headline font-bold text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
                        Import MoMo SMS Alert
                      </Text>
                      <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`} numberOfLines={1}>
                        Paste an MTN, Telecel, or bank SMS to pre-fill
                      </Text>
                    </View>
                  </View>
                  <ChevronRight
                    size={20}
                    color={isDark ? '#9ca3af' : '#707a6c'}
                    style={{ transform: [{ rotate: showAiPaste ? '90deg' : '0deg' }] } as any}
                  />
                </TouchableOpacity>
              </View>

              {showAiPaste && (
                <View
                  style={[
                    styles.formFieldCard,
                    {
                      marginTop: 12,
                      padding: 16,
                      backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : 'rgba(255, 255, 255, 0.96)',
                      borderColor: isDark ? 'rgba(164, 243, 185, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                    },
                  ]}
                >
                  <TextInput
                    placeholder="Paste your MoMo or bank SMS alert here..."
                    placeholderTextColor={isDark ? '#6b7280' : '#707a6c80'}
                    multiline
                    numberOfLines={3}
                    value={smsText}
                    onChangeText={setSmsText}
                    className={`w-full font-body p-3 rounded-xl ${isDark ? 'bg-black/25 text-dark-on-surface' : 'bg-white/60 text-on-surface'} text-sm min-h-[80px] mb-3`}
                    style={{ textAlignVertical: 'top' }}
                  />
                  <View className="flex-row justify-end space-x-3">
                    <TouchableOpacity
                      onPress={() => {
                        setSmsText('');
                        setShowAiPaste(false);
                      }}
                      className={`px-4 py-2.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-black/10'}`}
                    >
                      <Text className={`font-headline font-bold text-xs ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleParseSMS}
                      disabled={isParsingSms || !smsText.trim()}
                      className={`px-5 py-2.5 rounded-full bg-primary flex-row items-center space-x-2 ${(!smsText.trim() || isParsingSms) ? 'opacity-50' : ''}`}
                    >
                      {isParsingSms ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Sparkles size={14} color="#fff" />
                          <Text className="text-white font-headline font-bold text-xs">Fill Details</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Amount Section */}
            <View className="mb-8 items-center">
              <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-3`}>Enter Amount</Text>
              <View className="flex-row items-baseline space-x-3">
                <Text className="font-headline font-bold text-2xl text-primary">₵</Text>
                <Controller
                  control={control}
                  name="amount"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`min-w-[180px] text-center font-headline font-extrabold text-6xl tracking-tighter ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}
                      placeholder="0.00"
                      placeholderTextColor={isDark ? '#374151' : '#D1D5DB'}
                      keyboardType="decimal-pad"
                      value={value}
                      onChangeText={(text) => handleAmountChange(text, onChange)}
                      onBlur={onBlur}
                      autoFocus
                    />
                  )}
                />
              </View>
              <View className="h-1 w-12 bg-primary/20 mt-3 rounded-full" />
            </View>

            {/* Type Toggle */}
            <View className="mb-8 w-full max-w-[280px] self-center">
              <GlassSurface radius={999} style={{ padding: 6, flexDirection: 'row' }}>
                <TouchableOpacity 
                  onPress={() => {
                    setValue('transaction_type', 'expense');
                    setValue('category_id', '');
                    setCategoryName('Select Category');
                  }}
                  className={`flex-1 py-3 items-center rounded-full ${transactionType === 'expense' ? 'bg-primary shadow-lg' : ''}`}
                >
                  <Text className={`font-headline font-bold text-sm ${transactionType === 'expense' ? 'text-white' : isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    setValue('transaction_type', 'income');
                    setValue('category_id', '');
                    setCategoryName('Select Category');
                  }}
                  className={`flex-1 py-3 items-center rounded-full ${transactionType === 'income' ? 'bg-primary shadow-lg' : ''}`}
                >
                  <Text className={`font-headline font-bold text-sm ${transactionType === 'income' ? 'text-white' : isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Income</Text>
                </TouchableOpacity>
              </GlassSurface>
            </View>

            {/* Core Fields Grid */}
            <View className="space-y-4">
              <View style={{ flexDirection: 'row', gap: 14, marginBottom: 14 }}>
                {/* Category Picker */}
                <View
                  style={[
                    styles.formFieldCard,
                    {
                      flex: 1,
                      minWidth: 0,
                      backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : 'rgba(255, 255, 255, 0.96)',
                      borderColor: isDark ? 'rgba(164, 243, 185, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                    },
                  ]}
                >
                  <TouchableOpacity 
                    onPress={() => categorySheetRef.current?.snapToIndex(0)}
                    activeOpacity={0.85}
                    style={{ padding: 18 }}
                  >
                    <View 
                      className="w-11 h-11 rounded-2xl items-center justify-center mb-3"
                      style={{ backgroundColor: categoryName === 'Select Category' ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)') : `${categoryColor}25` }}
                    >
                      <Tag size={22} color={categoryName === 'Select Category' ? (isDark ? '#b2b6b1' : '#707a6c') : categoryColor} />
                    </View>
                    <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-1`}>Category</Text>
                    <Text className={`font-headline font-bold text-base ${categoryName === 'Select Category' ? isDark ? 'text-gray-400' : 'text-outline/60' : isDark ? 'text-dark-on-surface' : 'text-on-surface'}`} numberOfLines={1}>
                      {categoryName}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Paid With Picker */}
                <View
                  style={[
                    styles.formFieldCard,
                    {
                      flex: 1,
                      minWidth: 0,
                      backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : 'rgba(255, 255, 255, 0.96)',
                      borderColor: isDark ? 'rgba(164, 243, 185, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                    },
                  ]}
                >
                  <TouchableOpacity 
                    onPress={() => accountSheetRef.current?.snapToIndex(0)}
                    activeOpacity={0.85}
                    style={{ padding: 18 }}
                  >
                    <View className={`w-11 h-11 rounded-2xl ${isDark ? 'bg-secondary/20' : 'bg-secondary/10'} items-center justify-center mb-3`}>
                      <Wallet size={22} color={isDark ? '#818cf8' : '#4c56af'} />
                    </View>
                    <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-1`}>
                      {transactionType === 'income' ? 'Received In' : 'Paid With'}
                    </Text>
                    <Text className={`font-headline font-bold text-base ${accountName === 'Select Account' ? isDark ? 'text-gray-400' : 'text-outline/60' : isDark ? 'text-dark-on-surface' : 'text-on-surface'}`} numberOfLines={1}>
                      {accountName}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Interactive Date Selector */}
              <View
                style={[
                  styles.formFieldCard,
                  {
                    marginBottom: 14,
                    backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : 'rgba(255, 255, 255, 0.96)',
                    borderColor: isDark ? 'rgba(164, 243, 185, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowDateOptions(!showDateOptions);
                  }}
                  style={{ padding: 18, width: '100%' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <View className={`w-11 h-11 rounded-2xl ${isDark ? 'bg-white/10' : 'bg-black/5'} items-center justify-center`} style={{ marginRight: 14 }}>
                        <Calendar size={22} color={isDark ? '#b2b8b2' : '#40493d'} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-1`}>Date</Text>
                        <Text className={`font-headline font-bold text-base ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
                          {formatSelectedDateLabel(selectedDateStr)}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight
                      size={20}
                      color={isDark ? '#9ca3af' : '#707a6c'}
                      style={{ transform: [{ rotate: showDateOptions ? '90deg' : '0deg' }] } as any}
                    />
                  </View>
                </TouchableOpacity>

                {showDateOptions && (
                  <View className="px-4 pb-4 pt-1 border-t border-outline-variant/10">
                    <View className="flex-row space-x-2 mt-2">
                      <TouchableOpacity
                        onPress={() => {
                          setValue('transaction_date', toDateString(new Date()));
                          setShowNativeDatePicker(false);
                        }}
                        className={`flex-1 py-2.5 rounded-xl items-center ${selectedDateStr === toDateString(new Date()) ? 'bg-primary' : isDark ? 'bg-white/10' : 'bg-black/5'}`}
                      >
                        <Text className={`text-xs font-bold ${selectedDateStr === toDateString(new Date()) ? 'text-white' : isDark ? 'text-white' : 'text-charcoal'}`}>Today</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          const y = new Date();
                          y.setDate(y.getDate() - 1);
                          setValue('transaction_date', toDateString(y));
                          setShowNativeDatePicker(false);
                        }}
                        className={`flex-1 py-2.5 rounded-xl items-center ${(() => { const y = new Date(); y.setDate(y.getDate() - 1); return selectedDateStr === toDateString(y); })() ? 'bg-primary' : isDark ? 'bg-white/10' : 'bg-black/5'}`}
                      >
                        <Text className={`text-xs font-bold ${(() => { const y = new Date(); y.setDate(y.getDate() - 1); return selectedDateStr === toDateString(y); })() ? 'text-white' : isDark ? 'text-white' : 'text-charcoal'}`}>Yesterday</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setShowNativeDatePicker(true)}
                        className={`flex-1 py-2.5 rounded-xl items-center ${isDark ? 'bg-white/10' : 'bg-black/5'}`}
                      >
                        <Text className={`text-xs font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>Pick Date...</Text>
                      </TouchableOpacity>
                    </View>

                    {showNativeDatePicker && (
                      <View className="mt-3">
                        <DateTimePicker
                          value={new Date(`${selectedDateStr}T12:00:00`)}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'default'}
                          maximumDate={new Date()}
                          onChange={(_event, selectedDate) => {
                            if (Platform.OS !== 'ios') {
                              setShowNativeDatePicker(false);
                            }
                            if (selectedDate) {
                              setValue('transaction_date', toDateString(selectedDate));
                            }
                          }}
                        />
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Note / Description */}
              <View
                style={[
                  styles.formFieldCard,
                  {
                    padding: 18,
                    marginBottom: 14,
                    backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : 'rgba(255, 255, 255, 0.96)',
                    borderColor: isDark ? 'rgba(164, 243, 185, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-2`}>Note (Optional)</Text>
                <Controller
                  control={control}
                  name="description"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`w-full font-body ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} text-base`}
                      placeholder="e.g. Waakye lunch, Trotro to Circle..."
                      placeholderTextColor={isDark ? '#6b7280' : '#707a6c80'}
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                  )}
                />
              </View>

              {/* Progressive Disclosure: More details (Tags & Receipt) */}
              <View
                style={[
                  styles.formFieldCard,
                  {
                    backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : 'rgba(255, 255, 255, 0.96)',
                    borderColor: isDark ? 'rgba(164, 243, 185, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => setShowMoreDetails(!showMoreDetails)}
                  activeOpacity={0.85}
                  style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View className="flex-row items-center">
                    <Receipt size={18} color={isDark ? '#9ca3af' : '#707a6c'} />
                    <Text className={`ml-3 font-headline font-bold text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
                      More details (Tags & Receipt)
                    </Text>
                    {(tags.length > 0 || receiptImage) && (
                      <View className="ml-2 px-2 py-0.5 rounded-full bg-primary/15">
                        <Text className="text-[10px] font-bold text-primary">
                          {tags.length + (receiptImage ? 1 : 0)} added
                        </Text>
                      </View>
                    )}
                  </View>
                  <ChevronRight
                    size={18}
                    color={isDark ? '#9ca3af' : '#707a6c'}
                    style={{ transform: [{ rotate: showMoreDetails ? '90deg' : '0deg' }] } as any}
                  />
                </TouchableOpacity>

                {showMoreDetails && (
                  <View className="px-4 pb-4 pt-2 border-t border-outline-variant/10">
                    {/* Cross-Platform Inline Tag Input */}
                    <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-2`}>
                      Tags
                    </Text>
                    <View className="flex-row items-center space-x-2 mb-3">
                      <TextInput
                        value={tagInput}
                        onChangeText={setTagInput}
                        onSubmitEditing={handleAddInlineTag}
                        returnKeyType="done"
                        placeholder="Add a tag (e.g. food, work)"
                        placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                        className={`flex-1 px-3.5 py-2.5 rounded-xl font-body text-sm ${isDark ? 'bg-black/25 text-white' : 'bg-black/5 text-charcoal'}`}
                      />
                      <TouchableOpacity
                        onPress={handleAddInlineTag}
                        className="px-4 py-2.5 rounded-xl bg-primary flex-row items-center"
                      >
                        <Plus size={14} color="#fff" />
                        <Text className="text-white font-bold text-xs ml-1">Add</Text>
                      </TouchableOpacity>
                    </View>

                    {tags.length > 0 && (
                      <View className="flex-row flex-wrap mb-3">
                        {tags.map((tag) => (
                          <TouchableOpacity 
                            key={tag}
                            onPress={() => setTags(tags.filter(t => t !== tag))}
                            className="mr-2 mb-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/25 flex-row items-center space-x-1"
                          >
                            <Text className={`text-xs font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>#{tag}</Text>
                            <X size={12} color={isDark ? '#4ade80' : '#0d631b'} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Attach Receipt Button */}
                    <TouchableOpacity 
                      onPress={handleAttachReceipt}
                      className={`mt-1 px-4 py-3 rounded-xl ${isDark ? 'bg-white/10' : 'bg-black/5'} flex-row items-center justify-center space-x-2`}
                    >
                      <Receipt size={16} color={isDark ? '#e5e7eb' : '#374151'} />
                      <Text className={`font-label text-xs font-bold ${isDark ? 'text-white' : 'text-charcoal'}`}>
                        {receiptImage ? 'Change Receipt Photo' : 'Attach Receipt Photo'}
                      </Text>
                    </TouchableOpacity>

                    {receiptImage && (
                      <View className="mt-3 items-start">
                        <View className="relative rounded-2xl overflow-hidden border border-outline-variant/20 shadow-sm w-28 h-28">
                          <Image source={{ uri: receiptImage }} className="w-full h-full" style={{ resizeMode: 'cover' }} />
                          <TouchableOpacity 
                            onPress={() => setReceiptImage(null)}
                            className="absolute top-2 right-2 bg-black/60 w-6 h-6 rounded-full items-center justify-center"
                          >
                            <X size={10} color="white" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Save Button */}
      <View className="absolute bottom-8 left-0 right-0 px-8">
        <TouchableOpacity
          onPress={() => handleSubmit(onSubmit)()}
          disabled={isSubmitting}
          className={`w-full flex-row items-center justify-center space-x-3 py-4 rounded-[24px] shadow-2xl shadow-primary/30 ${isSubmitting ? 'bg-gray-400' : 'bg-primary'}`}
        >
          <Text className="text-white font-headline font-bold text-lg">Save {transactionType === 'income' ? 'Income' : 'Expense'}</Text>
          <CheckCircle size={20} color="white" />
        </TouchableOpacity>
      </View>

      <AccountPicker 
        bottomSheetRef={accountSheetRef} 
        onSelect={(id, name) => {
          setValue('account_id', id);
          setAccountName(name);
          AsyncStorage.setItem('last_used_account_id', id).catch(() => {});
        }} 
      />
      
      <CategoryPicker 
        bottomSheetRef={categorySheetRef} 
        type={transactionType}
        onSelect={(id, name) => {
          setValue('category_id', id);
          setCategoryName(name);
          const matched = categories?.find((c: any) => c.id === id);
          setCategoryColor(matched?.color || '#0d631b');
        }} 
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  formFieldCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});

export default AddTransactionScreen;
