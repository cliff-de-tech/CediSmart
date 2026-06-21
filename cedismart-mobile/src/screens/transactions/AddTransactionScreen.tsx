import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import BottomSheet from '@gorhom/bottom-sheet';
import { ChevronRight, Calendar, ArrowLeft, Utensils, Landmark, Smartphone, Wallet, Tag, Receipt, CheckCircle, Smartphone as MoMoIcon, Sparkles, X } from 'lucide-react-native';
import { formatGHS } from '../../utils/currency';
import AccountPicker from '../../components/shared/AccountPicker';
import CategoryPicker from '../../components/shared/CategoryPicker';
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

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<TransactionForm>({
    defaultValues: {
      amount: '',
      transaction_type: 'expense',
      account_id: '',
      category_id: '',
      description: '',
      transaction_date: new Date().toISOString().split('T')[0],
    }
  });

  const transactionType = watch('transaction_type');
  const amountValue = watch('amount');

  const [showAiPaste, setShowAiPaste] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [isParsingSms, setIsParsingSms] = useState(false);

  const [tags, setTags] = useState<string[]>([]);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  useEffect(() => {
    if (route.params?.openAiPaste) {
      setShowAiPaste(true);
    }
  }, [route.params?.openAiPaste]);

  const { data: categories } = useQuery<any[]>({
    queryKey: ['categories', transactionType],
    queryFn: async () => {
      const response = await apiClient.get(`/categories/?type=${transactionType}`);
      return response.data;
    },
    enabled: !!transactionType,
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
        Alert.alert('Autofill Successful', 'Transaction details pre-filled successfully! Please review before saving.');
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      console.warn('SMS Parsing failed:', err);
      Alert.alert('Parsing Failed', 'Could not parse the SMS. Please check format or input manually.');
    } finally {
      setIsParsingSms(false);
    }
  };

  const handleAddTag = () => {
    // Alert.prompt is iOS only
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Add Tag',
        'Enter tag name (e.g. food, transport, business):',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add',
            onPress: (text?: string) => {
              const clean = text?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
              if (clean && !tags.includes(clean)) {
                setTags([...tags, clean]);
              }
            }
          }
        ]
      );
    } else {
      // Android text fallback
      Alert.alert('Tag Feature', 'Type tag in description (e.g. #food) for matching.');
    }
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
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      Alert.alert('Missing Info', 'Please select an account.');
      return;
    }
    if (!data.category_id) {
      Alert.alert('Missing Info', 'Please select a category.');
      return;
    }

    setIsSubmitting(true);

    const notesPayload = JSON.stringify({
      tags: tags,
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

        Alert.alert('Success', 'Transaction saved successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        addTransaction({
          ...payload,
          queued_at: new Date().toISOString(),
        });
        
        Alert.alert('Saved Offline', 'Transaction queued for sync.', [
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
      {/* Header */}
      <View className={`flex-row items-center justify-between px-6 py-4 ${isDark ? 'bg-dark-background' : 'bg-surface'} sticky top-0 z-50`}>
        <View className="flex-row items-center space-x-4">
          <TouchableOpacity onPress={() => navigation.goBack()} className={`p-2 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} active:scale-95 transition-all`}>
            <ArrowLeft size={24} color={isDark ? '#e1e3e0' : '#0d631b'} />
          </TouchableOpacity>
          <Text className={`text-xl font-headline font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight`}>Add Transaction</Text>
        </View>
        <View className={`px-3 py-1 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-high'}`}>
          <Text className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-outline'}`}>₵ WALLET</Text>
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="px-6 pt-8 pb-32">
            
            {/* AI SMS Autofill Toggle */}
            <View className="mb-6">
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowAiPaste(!showAiPaste);
                }}
                className={`flex-row items-center justify-between p-4 rounded-[20px] ${
                  isDark ? 'bg-dark-surface-container-low border-dark-outline-variant/10' : 'bg-primary/5 border-primary/10'
                } border`}
              >
                <View className="flex-row items-center space-x-3">
                  <View className={`p-2 rounded-xl ${isDark ? 'bg-primary/20' : 'bg-primary/10'}`}>
                    <Sparkles size={18} color="#10b981" />
                  </View>
                  <View>
                    <Text className={`font-headline font-bold text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
                      Autofill with MoMo SMS
                    </Text>
                    <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Paste MTN/Telecel text to pre-fill form
                    </Text>
                  </View>
                </View>
                <ChevronRight
                  size={20}
                  color={isDark ? '#4b5563' : '#707a6c'}
                  style={{ transform: [{ rotate: showAiPaste ? '90deg' : '0deg' }] } as any}
                />
              </TouchableOpacity>

              {showAiPaste && (
                <View className={`mt-3 p-4 rounded-[20px] ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-surface-container-lowest border-outline-variant/5'} border space-y-3`}>
                  <TextInput
                    placeholder="Paste the transactional SMS alert here..."
                    placeholderTextColor={isDark ? '#4b5563' : '#707a6c50'}
                    multiline
                    numberOfLines={3}
                    value={smsText}
                    onChangeText={setSmsText}
                    className={`w-full font-body p-3 rounded-xl ${isDark ? 'bg-dark-surface-container-low text-dark-on-surface' : 'bg-surface-container-low text-on-surface'} text-sm min-h-[80px]`}
                    style={{ textAlignVertical: 'top' }}
                  />
                  <View className="flex-row justify-end space-x-3">
                    <TouchableOpacity
                      onPress={() => {
                        setSmsText('');
                        setShowAiPaste(false);
                      }}
                      className={`px-4 py-2.5 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-high'}`}
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
                          <Text className="text-white font-headline font-bold text-xs">Parse Alert</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Amount Section */}
            <View className="mb-12 items-center">
              <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-4`}>Enter Amount</Text>
              <View className="flex-row items-baseline space-x-3">
                <Text className="font-headline font-bold text-2xl text-primary">₵</Text>
                <Controller
                  control={control}
                  name="amount"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`min-w-[200px] text-center font-headline font-extrabold text-6xl tracking-tighter ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}
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
              <View className="h-1 w-12 bg-primary/20 mt-4 rounded-full" />
            </View>

            {/* Type Toggle */}
            <View className="mb-10 w-full max-w-[280px] self-center">
              <View className={`flex-row ${isDark ? 'bg-dark-surface-container-low border-dark-outline-variant/20' : 'bg-surface-container-low border-outline-variant/10'} p-1.5 rounded-full shadow-sm border`}>
                <TouchableOpacity 
                  onPress={() => {
                    setValue('transaction_type', 'expense');
                    setValue('category_id', '');
                    setCategoryName('Select Category');
                  }}
                  className={`flex-1 py-3 items-center rounded-full transition-all ${transactionType === 'expense' ? 'bg-primary shadow-lg' : ''}`}
                >
                  <Text className={`font-headline font-bold text-sm ${transactionType === 'expense' ? 'text-white' : isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    setValue('transaction_type', 'income');
                    setValue('category_id', '');
                    setCategoryName('Select Category');
                  }}
                  className={`flex-1 py-3 items-center rounded-full transition-all ${transactionType === 'income' ? 'bg-primary shadow-lg' : ''}`}
                >
                  <Text className={`font-headline font-bold text-sm ${transactionType === 'income' ? 'text-white' : isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Income</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Bento Grid */}
            <View className="space-y-4">
              <View className="flex-row space-x-4">
                {/* Category Picker */}
                <TouchableOpacity 
                  onPress={() => categorySheetRef.current?.snapToIndex(0)}
                  className={`flex-1 ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 active:bg-dark-surface-container-low' : 'bg-surface-container-lowest border-outline-variant/5 active:bg-surface-container-low'} p-6 rounded-[24px] shadow-sm border`}
                >
                  <View 
                    className="w-12 h-12 rounded-2xl items-center justify-center mb-4"
                    style={{ backgroundColor: categoryName === 'Select Category' ? (isDark ? '#1c221e' : '#ebe7ec') : `${categoryColor}20` }}
                  >
                    <Tag size={24} color={categoryName === 'Select Category' ? (isDark ? '#b2b6b1' : '#707a6c') : categoryColor} fill={categoryName === 'Select Category' ? 'none' : categoryColor} />
                  </View>
                  <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-1`}>Category</Text>
                  <Text className={`font-headline font-bold text-lg ${categoryName === 'Select Category' ? isDark ? 'text-gray-500' : 'text-outline/50' : isDark ? 'text-dark-on-surface' : 'text-on-surface'}`} numberOfLines={1}>
                    {categoryName}
                  </Text>
                </TouchableOpacity>

                {/* Account Picker */}
                <TouchableOpacity 
                  onPress={() => accountSheetRef.current?.snapToIndex(0)}
                  className={`flex-1 ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 active:bg-dark-surface-container-low' : 'bg-surface-container-lowest border-outline-variant/5 active:bg-surface-container-low'} p-6 rounded-[24px] shadow-sm border`}
                >
                  <View className={`w-12 h-12 rounded-2xl ${isDark ? 'bg-secondary/20' : 'bg-secondary/10'} items-center justify-center mb-4`}>
                    <Wallet size={24} color={isDark ? '#818cf8' : '#4c56af'} />
                  </View>
                  <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-1`}>Account</Text>
                  <Text className={`font-headline font-bold text-lg ${accountName === 'Select Account' ? isDark ? 'text-gray-500' : 'text-outline/50' : isDark ? 'text-dark-on-surface' : 'text-on-surface'}`} numberOfLines={1}>
                    {accountName}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Date Selector */}
              <TouchableOpacity className={`bg-surface-container-lowest ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 active:bg-dark-surface-container-low' : 'bg-surface-container-lowest border-outline-variant/5 active:bg-surface-container-low'} p-6 rounded-[24px] shadow-sm border`}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center space-x-4">
                    <View className={`w-12 h-12 rounded-2xl ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-high'} items-center justify-center`}>
                      <Calendar size={24} color={isDark ? '#b2b8b2' : '#40493d'} />
                    </View>
                    <View>
                      <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-1`}>Date</Text>
                      <Text className={`font-headline font-bold text-lg ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Today, {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
                    </View>
                  </View>
                  <ChevronRight size={20} color={isDark ? '#4b5563' : '#707a6c'} />
                </View>
              </TouchableOpacity>

              {/* Description */}
              <View className={`${isDark ? 'bg-dark-surface-container-low focus-within:bg-dark-surface-container-lowest' : 'bg-surface-container-low focus-within:bg-surface-container-highest'} rounded-[24px] p-6 transition-all shadow-sm`}>
                <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-2`}>Description (Optional)</Text>
                <Controller
                  control={control}
                  name="description"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`w-full font-body ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} text-base`}
                      placeholder="What was this for?"
                      placeholderTextColor={isDark ? '#4b5563' : '#707a6c50'}
                      multiline
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                  )}
                />
              </View>
            </View>

            {/* Tags/Receipts Horizontal */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-8 overflow-visible">
              <TouchableOpacity 
                onPress={handleAddTag}
                className={`mr-3 px-6 py-3 rounded-full ${isDark ? 'bg-dark-surface-container-low border-dark-outline-variant/10 active:bg-dark-surface-container-lowest' : 'bg-surface-container-high border-outline-variant/5 active:bg-surface-container-highest'} flex-row items-center space-x-2 border shadow-sm`}
              >
                <Tag size={16} color={isDark ? '#b2b8b2' : '#40493d'} />
                <Text className={`font-label text-xs font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Add Tag</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleAttachReceipt}
                className={`px-6 py-3 rounded-full ${isDark ? 'bg-dark-surface-container-low border-dark-outline-variant/10 active:bg-dark-surface-container-lowest' : 'bg-surface-container-high border-outline-variant/5 active:bg-surface-container-highest'} flex-row items-center space-x-2 border shadow-sm`}
              >
                <Receipt size={16} color={isDark ? '#b2b8b2' : '#40493d'} />
                <Text className={`font-label text-xs font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Attach Receipt</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Selected Tags Display */}
            {tags.length > 0 && (
              <View className="flex-row flex-wrap mt-4">
                {tags.map((tag) => (
                  <TouchableOpacity 
                    key={tag}
                    onPress={() => setTags(tags.filter(t => t !== tag))}
                    className="mr-2 mb-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 flex-row items-center space-x-1 active:bg-red-500/10 active:border-red-500/20"
                  >
                    <Text className="text-xs font-bold text-primary">#{tag}</Text>
                    <X size={12} color="#0d631b" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Receipt Preview */}
            {receiptImage && (
              <View className="mt-4 items-start">
                <Text className={`font-label uppercase tracking-widest text-[10px] ${isDark ? 'text-gray-400' : 'text-outline'} mb-2`}>Attached Receipt</Text>
                <View className="relative rounded-2xl overflow-hidden border border-outline-variant/20 shadow-sm w-32 h-32">
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
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Save Button */}
      <View className="absolute bottom-10 left-0 right-0 px-10">
        <TouchableOpacity
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          className={`w-full flex-row items-center justify-center space-x-3 py-5 rounded-[24px] shadow-2xl shadow-primary/30 ${isSubmitting ? 'bg-gray-300' : 'bg-primary'}`}
        >
          <Text className="text-white font-headline font-bold text-lg">Save Transaction</Text>
          <CheckCircle size={20} color="white" />
        </TouchableOpacity>
      </View>

      <AccountPicker 
        bottomSheetRef={accountSheetRef} 
        onSelect={(id, name) => {
          setValue('account_id', id);
          setAccountName(name);
        }} 
      />
      
      <CategoryPicker 
        bottomSheetRef={categorySheetRef} 
        type={transactionType}
        onSelect={(id, name) => {
          setValue('category_id', id);
          setCategoryName(name);
          // For demo, we'll just use primary green if no color
          setCategoryColor('#0d631b');
        }} 
      />
    </SafeAreaView>
  );
};

export default AddTransactionScreen;
