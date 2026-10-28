import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GlassSheetBackground } from '../../components/glass/GlassSheetBackground';
import { GlassSurface } from '../../components/glass/GlassSurface';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGlassTabBarMetrics } from '../../components/glass/useGlassTabBarMetrics';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, TextInput, KeyboardAvoidingView, Platform, Modal, Image, ActivityIndicator, Dimensions, StyleSheet, Keyboard, TouchableWithoutFeedback } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../../stores/authStore';
import { useOfflineStore } from '../../stores/offlineStore';
import { useThemeStore } from '../../stores/themeStore';
import { User, Shield, Database, LogOut, Trash2, ChevronRight, Smartphone, Landmark, Award, Sun, SunMoon, Moon, Bell, ShieldCheck, Users, Plus, Wifi, WifiOff, RefreshCw, FileSpreadsheet, FileText, Info, X, Check, Bug, HelpCircle, MessageSquare, Headphones, Search, Mic, Sparkles, BookOpen, ExternalLink, PieChart } from 'lucide-react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import BottomSheet from '../../components/shared/AppBottomSheet';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import PINPad from '../../components/shared/PINPad';
import { formatGHS } from '../../utils/currency';
import apiClient, { setActiveTokens, clearActiveSession } from '../../api/client';
import { requestNotificationPermissions, triggerLocalNotification } from '../../utils/notifications';
import { SupportModal } from '../../components/shared/SupportModal';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { generateAndSharePdfStatement } from '../../utils/statementGenerator';
let setAppIcon: any = null;
try {
  setAppIcon = require('@howincodes/expo-dynamic-app-icon').setAppIcon;
} catch (e) {
  // Gracefully catch import error if native module is not compiled in (e.g. in Expo Go sandbox)
}

const DEFAULT_AVATAR_URL = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCPbtwyh4Eo_96C5zd6dFJFY9kbHP067jJpa7Aayw3aUk1co9x1_rJZOkN1473J1n10wGOmZyH_imPk56BMFUhtqh97n0NlHcDadkkvYPKlykD_wgKQ0fNUrBK4Iu1lJLUicP3eclDQXCGAAWUx5hODGPkFmHdt7ak3QMG9zCIQ1woeQWjZ7lpo8WpbJ3fIQepJ_Q7ZT7r1xyJBsDS0TdhOmQJP54CdoizSC8UpE8ln59Y5-6_lJNv8GhvkiAlc4Ddi9D8xyhpQ_YM';

const normalizePhoneNumber = (phone: string): string => {
  if (!phone) return '';
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.startsWith('+233')) return clean;
  if (clean.startsWith('233')) return `+${clean}`;
  if (clean.startsWith('0')) return `+233${clean.substring(1)}`;
  return `+233${clean}`;
};

const SettingsGroup = ({ children, style }: { children: React.ReactNode; style?: any }) => {
  const isDark = useThemeStore((state) => state.theme) === 'dark';
  return (
    <View
      style={[
        {
          borderRadius: 24,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(164, 243, 185, 0.12)' : 'rgba(0, 0, 0, 0.07)',
          backgroundColor: isDark ? 'rgba(20, 30, 24, 0.88)' : 'rgba(255, 255, 255, 0.95)',
          overflow: 'hidden',
          marginBottom: 16,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: isDark ? 0.2 : 0.06,
          shadowRadius: 10,
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const SettingItem = ({ icon: Icon, title, value, onPress, color, children, hideChevron, rightElement, isLast = false }: any) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const iconColor = color || (isDark ? '#e1e3e0' : '#1C1C2E');
  return (
    <View>
      <TouchableOpacity 
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          paddingVertical: 15,
          width: '100%',
        }}
      >
        <View
          className={`w-10 h-10 rounded-full ${isDark ? 'bg-white/10' : 'bg-black/5'} items-center justify-center`}
          style={{ marginRight: 14, flexShrink: 0 }}
        >
          <Icon size={20} color={iconColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-[10px] font-bold uppercase tracking-wider mb-1`}
            numberOfLines={1}
          >
            {title}
          </Text>
          {children || (
            <Text
              className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {value}
            </Text>
          )}
        </View>
        {rightElement ? (
          <View style={{ marginLeft: 12, flexShrink: 0, justifyContent: 'center' }}>
            {rightElement}
          </View>
        ) : (
          onPress && !hideChevron && (
            <View style={{ marginLeft: 10, flexShrink: 0 }}>
              <ChevronRight size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
            </View>
          )
        )}
      </TouchableOpacity>
      {!isLast && (
        <View
          style={{
            height: StyleSheet.hairlineWidth || 1,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            marginLeft: 72,
          }}
        />
      )}
    </View>
  );
};


const SettingsScreen = ({ navigation, route }: any) => {
  const { clearance: tabBarClearance } = useGlassTabBarMetrics();
  const { user, logout, updateUser, savedAccounts, loadSavedAccounts, removeSavedAccount, login } = useAuthStore();
  const { queue, clearQueue } = useOfflineStore();
  
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.full_name || '');
  const [userAvatarUri, setUserAvatarUri] = useState<string>(DEFAULT_AVATAR_URL);
  const [isViewingProfilePhoto, setIsViewingProfilePhoto] = useState(false);
  const profileDetailSheetRef = useRef<BottomSheet>(null);
  const nameInputRef = useRef<any>(null);

  const pickProfileImage = async () => {
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
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const selectedUri = asset.base64
          ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
          : asset.uri;
        setUserAvatarUri(selectedUri);
        if (user?.id) {
          await AsyncStorage.setItem(`user_avatar_${user.id}`, selectedUri);
          apiClient.patch('/users/me', { avatar_url: selectedUri }).catch(() => {});
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while picking the image.');
    }
  };

  const handleProfileAvatarPress = () => {
    Alert.alert(
      'Profile Photo',
      'Choose an action for your profile picture.',
      [
        { text: 'View Photo', onPress: () => setIsViewingProfilePhoto(true) },
        { text: 'Change Photo', onPress: pickProfileImage },
        {
          text: 'Remove Photo',
          style: 'destructive',
          onPress: async () => {
            setUserAvatarUri(DEFAULT_AVATAR_URL);
            if (user?.id) {
              await AsyncStorage.removeItem(`user_avatar_${user.id}`);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Apple-Style Search & 2-Stage Dynamic Scroll Choreography
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const settingsSearchInputRef = useRef<any>(null);
  const settingsScrollRef = useRef<any>(null);
  const scrollY = useSharedValue(0);
  const SEARCH_COLLAPSE_DISTANCE = 50;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const stickyHeaderAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [SEARCH_COLLAPSE_DISTANCE + 4, SEARCH_COLLAPSE_DISTANCE + 32],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const largeTitleAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [0, SEARCH_COLLAPSE_DISTANCE],
      [0, SEARCH_COLLAPSE_DISTANCE],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      scrollY.value,
      [SEARCH_COLLAPSE_DISTANCE + 2, SEARCH_COLLAPSE_DISTANCE + 28],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateY }],
      opacity,
      zIndex: 10,
    };
  });

  const searchBarAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 28],
      [1, 0],
      Extrapolation.CLAMP
    );
    const scaleY = interpolate(
      scrollY.value,
      [0, SEARCH_COLLAPSE_DISTANCE],
      [1, 0.85],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      transform: [{ scaleY }],
    };
  });

  const handleScrollEndDrag = useCallback((event: any) => {
    const y = event?.nativeEvent?.contentOffset?.y ?? 0;
    const vy = Math.abs(event?.nativeEvent?.velocity?.y ?? 0);
    if (vy < 0.15 && y > 0 && y < SEARCH_COLLAPSE_DISTANCE) {
      const targetY = y < SEARCH_COLLAPSE_DISTANCE / 2 ? 0 : SEARCH_COLLAPSE_DISTANCE;
      settingsScrollRef.current?.scrollTo?.({ y: targetY, animated: true });
    }
  }, []);

  const handleMomentumScrollEnd = useCallback((event: any) => {
    const y = event?.nativeEvent?.contentOffset?.y ?? 0;
    if (y > 0 && y < SEARCH_COLLAPSE_DISTANCE) {
      const targetY = y < SEARCH_COLLAPSE_DISTANCE / 2 ? 0 : SEARCH_COLLAPSE_DISTANCE;
      settingsScrollRef.current?.scrollTo?.({ y: targetY, animated: true });
    }
  }, []);

  const normalizedSearch = settingsSearchQuery.trim().toLowerCase();
  const matchesSearch = useCallback(
    (...keywords: string[]) => {
      if (!normalizedSearch) return true;
      return keywords.some((kw) => kw.toLowerCase().includes(normalizedSearch));
    },
    [normalizedSearch]
  );

  // KYC States
  const kycSheetRef = useRef<BottomSheet>(null);
  const pricingSheetRef = useRef<BottomSheet>(null);
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'business'>('pro');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isActivatingTrial, setIsActivatingTrial] = useState(false);
  const [isCancellingPlan, setIsCancellingPlan] = useState(false);
  const [isKycVerified, setIsKycVerified] = useState(false);
  const [ghanaCardNumber, setGhanaCardNumber] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [fullNameKyc, setFullNameKyc] = useState('');
  const [dobKyc, setDobKyc] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [kycError, setKycError] = useState('');

  // Multi-Account Switcher States
  const switchSheetRef = useRef<BottomSheet>(null);
  const [isSwitchingModalVisible, setIsSwitchingModalVisible] = useState(false);
  const [switchingTarget, setSwitchingTarget] = useState<any>(null);
  const [switchPin, setSwitchPin] = useState('');
  const [switchError, setSwitchError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | null>(null);
  const [accountAvatars, setAccountAvatars] = useState<Record<string, string>>({});

  // Data & Storage States
  const offlineQueueSheetRef = useRef<BottomSheet>(null);
  const appIconSheetRef = useRef<BottomSheet>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [currentAppIcon, setCurrentAppIcon] = useState('Luminous Emerald');
  const [isOnline, setIsOnline] = useState(true);
  const [appLockSetting, setAppLockSetting] = useState('never');
  const [budgetThreshold, setBudgetThreshold] = useState(0.8);

  // Bug reporting states
  const bugSheetRef = useRef<BottomSheet>(null);
  const bugTitleInputRef = useRef<any>(null);
  const bugDescInputRef = useRef<any>(null);
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const [isSupportModalVisible, setIsSupportModalVisible] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  // Feedback states
  const feedbackSheetRef = useRef<BottomSheet>(null);
  const feedbackDescInputRef = useRef<any>(null);
  const [feedbackType, setFeedbackType] = useState('feature_request'); // 'feature_request', 'suggestion', 'other'
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Guides & Web Documentation states
  const guideSheetRef = useRef<BottomSheet>(null);
  const [selectedGuideId, setSelectedGuideId] = useState<'sms' | 'budgets' | 'gestures' | 'profiles'>('sms');
  const CEDISMART_DOCS_URL = process.env.EXPO_PUBLIC_DOCS_URL || 'https://cedismartweb.netlify.app/docs.html';

  const openWebDocs = useCallback(async (sectionHash?: string) => {
    Haptics.selectionAsync().catch(() => {});
    const targetUrl = sectionHash ? `${CEDISMART_DOCS_URL}${sectionHash}` : CEDISMART_DOCS_URL;
    try {
      await WebBrowser.openBrowserAsync(targetUrl);
    } catch (err) {
      Alert.alert('CediSmart Documentation', `Visit ${targetUrl} in your browser to read the complete end-to-end user guide.`);
    }
  }, [CEDISMART_DOCS_URL]);

  const openGuide = useCallback((id: 'sms' | 'budgets' | 'gestures' | 'profiles') => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedGuideId(id);
    guideSheetRef.current?.snapToIndex(0);
  }, []);


  const queryClient = useQueryClient();
  const { syncTransactions } = useOfflineSync();

  // Listen to connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch all categories for mappings
  const { data: categories } = useQuery<any[]>({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/categories/');
      return response.data;
    },
    enabled: !!user?.id
  });

  const categoryMap = useMemo(() => {
    const map = new Map<string, any>();
    if (categories) {
      categories.forEach(c => map.set(c.id, c));
    }
    return map;
  }, [categories]);

  // Fetch linked accounts to check if bank/momo are active
  const { data: accounts } = useQuery<any[]>({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/accounts/');
      return response.data;
    },
    enabled: !!user?.id
  });

  const accountMap = useMemo(() => {
    const map = new Map<string, any>();
    if (accounts) {
      accounts.forEach(a => map.set(a.id, a));
    }
    return map;
  }, [accounts]);

  const isLinked = useMemo(() => {
    if (!accounts) return false;
    return accounts.some(acc => acc.account_type === 'bank' || acc.account_type === 'mobile_money');
  }, [accounts]);

  // Sync latest user profile & avatar on screen focus to keep trial days, subscription & photo fresh
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      if (user?.id) {
        AsyncStorage.getItem(`user_avatar_${user.id}`)
          .then((uri) => {
            if (isMounted) {
              setUserAvatarUri(uri || DEFAULT_AVATAR_URL);
            }
          })
          .catch(() => {});
      }
      apiClient.get('/users/me')
        .then((res) => {
          if (isMounted && res.data) {
            updateUser(res.data);
          }
        })
        .catch(() => {
          // Offline or network error — silent catch
        });
      return () => {
        isMounted = false;
      };
    }, [updateUser, user?.id])
  );

  // Load KYC state and saved accounts on mount
  useEffect(() => {
    loadSavedAccounts();
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
    if (user?.id) {
      AsyncStorage.getItem(`kyc_verified_${user.id}`).then((val) => {
        setIsKycVerified(val === 'true');
      });
      AsyncStorage.getItem(`ghana_card_${user.id}`).then((val) => {
        if (val) setGhanaCardNumber(val);
      });
      AsyncStorage.getItem(`biometric_enabled_${user.id}`).then((val) => {
        setIsBiometricEnabled(val === 'true');
      });
      AsyncStorage.getItem(`sms_alerts_enabled_${user.id}`).then((val) => {
        if (val !== null) setSmsAlerts(val === 'true');
      });
      AsyncStorage.getItem(`budget_alerts_enabled_${user.id}`).then((val) => {
        if (val !== null) setBudgetAlerts(val === 'true');
      });
      AsyncStorage.getItem(`premium_app_icon_${user.id}`).then((val) => {
        if (val) {
          if (val === 'Classic Emerald') {
            setCurrentAppIcon('Luminous Emerald');
          } else if (val === 'Royal Amethyst') {
            setCurrentAppIcon('Sovereign Amber');
          } else {
            setCurrentAppIcon(val);
          }
        }
      });
      AsyncStorage.getItem(`app_lock_setting_${user.id}`).then((val) => {
        if (val) setAppLockSetting(val);
      });
      AsyncStorage.getItem(`budget_alert_threshold_${user.id}`).then((val) => {
        if (val) setBudgetThreshold(parseFloat(val));
      });
    }
  }, [user?.id, loadSavedAccounts]);

  // Listen for openKyc parameter to trigger sheet automatically
  useEffect(() => {
    if (route?.params?.openKyc) {
      kycSheetRef.current?.snapToIndex(0);
      navigation.setParams({ openKyc: undefined });
    }
  }, [route?.params?.openKyc]);

  const handleKycVerification = async () => {
    setKycError('');
    
    // 1. Ghana Card Number Validation
    const cardRegex = /^GHA-\d{9}-\d$/;
    if (!cardRegex.test(cardNum.trim())) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setKycError('Format must be GHA-XXXXXXXXX-X (9 digits, e.g. GHA-123456789-0)');
      return;
    }

    // 2. Full Name Validation (At least First + Last name, alphabetical + spaces only)
    const cleanKycName = fullNameKyc.trim();
    if (!cleanKycName) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setKycError('Please enter your full name as shown on the card');
      return;
    }
    const nameWords = cleanKycName.split(/\s+/);
    if (nameWords.length < 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setKycError('Please enter both your first and last name');
      return;
    }
    const invalidCharRegex = /[^a-zA-Z\s'-]/;
    if (invalidCharRegex.test(cleanKycName)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setKycError('Name can only contain letters, spaces, hyphens, and apostrophes');
      return;
    }

    // 3. Date of Birth Validation (Format, Valid date, and minimum age 15)
    const dobTrimmed = dobKyc.trim();
    if (!dobTrimmed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setKycError('Please enter your Date of Birth');
      return;
    }
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dobRegex.test(dobTrimmed)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setKycError('Date of Birth must be in YYYY-MM-DD format');
      return;
    }
    const [year, month, day] = dobTrimmed.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    if (
      dateObj.getFullYear() !== year ||
      dateObj.getMonth() !== month - 1 ||
      dateObj.getDate() !== day
    ) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setKycError('Please enter a valid Date of Birth');
      return;
    }
    
    const today = new Date();
    let age = today.getFullYear() - year;
    const m = today.getMonth() - (month - 1);
    if (m < 0 || (m === 0 && today.getDate() < day)) {
      age--;
    }
    if (age < 15) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setKycError('You must be at least 15 years old to verify with a Ghana Card');
      return;
    }
    if (age > 120) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setKycError('Please enter a valid Date of Birth');
      return;
    }

    setIsVerifying(true);
    try {
      const response = await apiClient.post('/users/verify-kyc', {
        ghana_card_number: cardNum.trim(),
        full_name: fullNameKyc.trim(),
        dob: dobTrimmed
      });

      setIsVerifying(false);
      setIsKycVerified(true);
      setGhanaCardNumber(cardNum.trim());
      if (user?.id) {
        await AsyncStorage.setItem(`kyc_verified_${user.id}`, 'true');
        await AsyncStorage.setItem(`ghana_card_${user.id}`, cardNum.trim());
      }
      
      // Update local auth store with the newly verified user state
      updateUser(response.data);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Verification Successful',
        'Your identity has been verified successfully (Tier 1 Verified)!',
        [
          {
            text: 'OK',
            onPress: () => {
              if (route?.params?.redirectTo) {
                const target = route.params.redirectTo;
                // Clear parameters
                navigation.setParams({ openKyc: undefined, redirectTo: undefined });
                // Navigate back
                navigation.navigate(target);
              }
            }
          }
        ]
      );
      kycSheetRef.current?.close();
      setCardNum('');
      setFullNameKyc('');
      setDobKyc('');
    } catch (error: any) {
      setIsVerifying(false);
      const errMsg = error.response?.data?.error?.message || 'NIA verification gateway timed out. Please try again.';
      setKycError(errMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  // Theme & Notifications States
  const { theme, themeMode, setThemeMode, setTheme } = useThemeStore();
  const isDark = theme === 'dark';

  // Dynamic calculation of trial days remaining so countdown is always live & accurate
  const effectiveTrialDays = useMemo(() => {
    if (!user?.trial_started_at) {
      return user?.trial_days_remaining ?? 0;
    }
    const start = new Date(user.trial_started_at).getTime();
    if (isNaN(start)) {
      return user?.trial_days_remaining ?? 0;
    }
    const elapsedMs = Math.max(0, Date.now() - start);
    const daysPassed = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
    return Math.max(0, 7 - daysPassed);
  }, [user?.trial_started_at, user?.trial_days_remaining]);

  const effectiveTrialActive = useMemo(() => {
    if (user?.is_premium) return false;
    if (user?.trial_started_at) {
      return effectiveTrialDays > 0;
    }
    return !!user?.is_trial_active;
  }, [user?.is_premium, user?.trial_started_at, user?.is_trial_active, effectiveTrialDays]);

  const [smsAlerts, setSmsAlerts] = useState(true);
  const [budgetAlerts, setBudgetAlerts] = useState(true);

  // Security PIN Change States
  const pinSheetRef = useRef<BottomSheet>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<1 | 2 | 3>(1);
  const [pinError, setPinError] = useState('');

  // Biometric PIN Verification States
  const biometricPinSheetRef = useRef<BottomSheet>(null);
  const [biometricPin, setBiometricPin] = useState('');
  const [biometricPinError, setBiometricPinError] = useState('');
  const [isVerifyingBiometricPin, setIsVerifyingBiometricPin] = useState(false);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  const resetPinForm = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinStep(1);
    setPinError('');
  };

  const handlePinPress = async (digit: string) => {
    setPinError('');
    if (pinStep === 1) {
      if (currentPin.length < 6) {
        const p = currentPin + digit;
        setCurrentPin(p);
        if (p.length === 6) {
          // Verify the entered current PIN against SecureStore
          try {
            const normalized = normalizePhoneNumber(user?.phone || '');
            const sanitizedPhone = normalized.replace(/[^\w.-]/g, '');
            const storedPin = await SecureStore.getItemAsync(`user_pin_${sanitizedPhone}`);
            if (storedPin === p) {
              setTimeout(() => setPinStep(2), 200);
            } else {
              setPinError('Incorrect current PIN. Please try again.');
              setCurrentPin('');
            }
          } catch (err) {
            setPinError('Error verifying PIN. Please try again.');
            setCurrentPin('');
          }
        }
      }
    } else if (pinStep === 2) {
      if (newPin.length < 6) {
        const p = newPin + digit;
        setNewPin(p);
        if (p.length === 6) {
          if (p === currentPin) {
            setPinError('New PIN must be different from current PIN');
            setNewPin('');
            return;
          }
          setTimeout(() => setPinStep(3), 200);
        }
      }
    } else {
      if (confirmPin.length < 6) {
        const p = confirmPin + digit;
        setConfirmPin(p);
        if (p.length === 6) {
          if (p === newPin) {
            // Save the new PIN to SecureStore
            try {
              const normalized = normalizePhoneNumber(user?.phone || '');
              const sanitizedPhone = normalized.replace(/[^\w.-]/g, '');
              await SecureStore.setItemAsync(`user_pin_${sanitizedPhone}`, newPin);
              Alert.alert('Success', 'Your security PIN has been updated successfully!');
              pinSheetRef.current?.close();
              resetPinForm();
            } catch (err) {
              setPinError('Failed to save new PIN. Please try again.');
              setConfirmPin('');
            }
          } else {
            setPinError('PINs do not match. Try setting your new PIN again.');
            setConfirmPin('');
            setNewPin('');
            setPinStep(2);
          }
        }
      }
    }
  };

  const handlePinBackspace = () => {
    setPinError('');
    if (pinStep === 1) {
      setCurrentPin(currentPin.slice(0, -1));
    } else if (pinStep === 2) {
      if (newPin.length > 0) {
        setNewPin(newPin.slice(0, -1));
      } else {
        setPinStep(1);
      }
    } else {
      if (confirmPin.length > 0) {
        setConfirmPin(confirmPin.slice(0, -1));
      } else {
        setPinStep(2);
      }
    }
  };

  const handleBiometricToggle = async (val: boolean) => {
    if (val) {
      // Enable biometric login
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometrics Not Enrolled',
          'FaceID / Fingerprint is not set up on this device. Please register biometrics in your device settings.'
        );
        return;
      }

      setBiometricPin('');
      setBiometricPinError('');
      biometricPinSheetRef.current?.snapToIndex(0);
    } else {
      // Disable biometric login
      Alert.alert(
        'Disable Biometrics',
        'Are you sure you want to disable biometric login?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              if (user?.id) {
                await SecureStore.deleteItemAsync('biometric_phone');
                if (user.phone) {
                  const normalized = normalizePhoneNumber(user.phone);
                  const sanitizedPhone = normalized.replace(/[^\w.-]/g, '');
                  const deleteKey = `user_pin_${sanitizedPhone}`;
                  console.log('[SecureStore Debug - Settings] Deleting PIN with key:', deleteKey);
                  await SecureStore.deleteItemAsync(deleteKey);
                }
                await AsyncStorage.setItem(`biometric_enabled_${user.id}`, 'false');
                setIsBiometricEnabled(false);
              }
            }
          }
        ]
      );
    }
  };

  const handleSmsAlertsToggle = async (val: boolean) => {
    setSmsAlerts(val);
    if (user?.id) {
      await AsyncStorage.setItem(`sms_alerts_enabled_${user.id}`, val ? 'true' : 'false');
    }
  };

  const handleBudgetAlertsToggle = async (val: boolean) => {
    setBudgetAlerts(val);
    if (user?.id) {
      await AsyncStorage.setItem(`budget_alerts_enabled_${user.id}`, val ? 'true' : 'false');
      if (val) {
        const permitted = await requestNotificationPermissions();
        if (!permitted) {
          Alert.alert(
            'Permissions Required',
            'Please enable notifications for CediSmart (Expo Go) in your device settings to receive budget alerts.'
          );
          setBudgetAlerts(false);
          await AsyncStorage.setItem(`budget_alerts_enabled_${user.id}`, 'false');
        } else {
          await triggerLocalNotification(
            'CediSmart Alerts Enabled 🔔',
            'You will now receive alerts when your spending reaches 80% of your budget limits!'
          );
        }
      }
    }
  };

  const handleBiometricPinPress = async (digit: string) => {
    setBiometricPinError('');
    if (biometricPin.length < 6) {
      const newPin = biometricPin + digit;
      setBiometricPin(newPin);
      if (newPin.length === 6) {
        let pinVerified = false;
        const normalized = normalizePhoneNumber(user?.phone || '');
        try {
          setIsVerifyingBiometricPin(true);
          await apiClient.post('/auth/login', { phone: normalized, pin: newPin });
          pinVerified = true;
        } catch (err: any) {
          const serverError = err?.response?.data?.error;
          const errorMsg = typeof serverError === 'string'
            ? serverError
            : serverError?.message || 'Invalid security PIN. Please try again.';
          setBiometricPinError(errorMsg);
          setBiometricPin('');
          setIsVerifyingBiometricPin(false);
          return;
        }

        // If the PIN is verified, proceed to biometric authentication
        try {
          const bioAuth = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Authorize Biometric Login',
            fallbackLabel: 'Use PIN',
          });
          
          if (bioAuth.success) {
            if (user?.phone && user?.id) {
              const sanitizedPhone = normalized.replace(/[^\w.-]/g, '');
              const storeKey = `user_pin_${sanitizedPhone}`;
              console.log('[SecureStore Debug - Settings] Storing biometric_phone with value:', normalized);
              await SecureStore.setItemAsync('biometric_phone', normalized);
              console.log('[SecureStore Debug - Settings] Storing PIN with key:', storeKey);
              await SecureStore.setItemAsync(storeKey, newPin);
              await AsyncStorage.setItem(`biometric_enabled_${user.id}`, 'true');
              setIsBiometricEnabled(true);
              Alert.alert('Success', 'Biometric login enabled successfully!');
              biometricPinSheetRef.current?.close();
            }
          } else {
            const errorDetail = bioAuth.error ? ` (${bioAuth.error})` : '';
            setBiometricPinError(`Biometric authentication failed${errorDetail}. Please ensure Face ID/Touch ID is enabled and permitted for Expo Go in your iOS Settings.`);
            setBiometricPin('');
          }
        } catch (bioErr: any) {
          console.error('Biometric authentication error during registration:', bioErr);
          const errorMsg = bioErr?.message ? ` (${bioErr.message})` : '';
          setBiometricPinError(`Biometric setup failed${errorMsg}. Please ensure Face ID/Touch ID permission is granted for Expo Go in your iOS Settings.`);
          setBiometricPin('');
        } finally {
          setIsVerifyingBiometricPin(false);
        }
      }
    }
  };

  const handleBiometricPinBackspace = () => {
    setBiometricPinError('');
    setBiometricPin(biometricPin.slice(0, -1));
  };

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setIsBiometricSupported(compatible);
    })();
  }, []);

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
          switchSheetRef.current?.close();
          
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
        switchSheetRef.current?.close();
        
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
          switchSheetRef.current?.close();
          
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

  const handleSwitchPinDigitPress = async (digit: string) => {
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

  const handleSwitchPinBackspace = () => {
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
    switchSheetRef.current?.close();
    logout();
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Logout', 
        style: 'destructive', 
        onPress: async () => {
          try {
            // Retrieve and remove device push token from server
            const token = await AsyncStorage.getItem('expo_push_token');
            if (token && token !== 'expo-go-dummy-token') {
              await apiClient.delete('/users/me/device-tokens', { data: { token } });
            }
          } catch (err) {
            console.warn('[Notifications] Failed to remove push token from server:', err);
          }

          try {
            // Attempt to inform backend (optional, but good practice)
            const refreshToken = await SecureStore.getItemAsync('refresh_token');
            if (refreshToken) {
              await apiClient.post('/auth/logout', { refresh_token: refreshToken });
            }
          } catch (e) {
            console.warn('Backend logout failed, clearing local session anyway');
          } finally {
            try {
              // Suppress auto-biometrics on next mount of Login screen
              await AsyncStorage.setItem('suppress_auto_bio', 'true');
            } catch (err) {}
            
            if (user?.phone) {
              await clearActiveSession(user.phone);
            }
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
          onPress: async (text?: string) => {
            if (text === 'DELETE') {
              try {
                const phoneToRemove = user?.phone;
                await apiClient.delete('/users/me');
                if (phoneToRemove) {
                  await removeSavedAccount(phoneToRemove);
                } else {
                  await SecureStore.deleteItemAsync('access_token');
                  await SecureStore.deleteItemAsync('refresh_token');
                  logout();
                }
                try {
                  // Clear last logged in user reference
                  await AsyncStorage.removeItem('last_logged_in_phone');
                } catch (err) {}
                clearQueue(); // Remove any pending offline transactions
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

  const handleReportBug = async () => {
    if (!bugTitle.trim() || !bugDescription.trim()) {
      Alert.alert('Required Fields', 'Please fill in both the title and description.');
      return;
    }
    if (bugTitle.trim().length < 3) {
      Alert.alert('Validation Error', 'Title must be at least 3 characters.');
      return;
    }
    if (bugDescription.trim().length < 10) {
      Alert.alert('Validation Error', 'Description must be at least 10 characters.');
      return;
    }

    setIsSubmittingBug(true);
    try {
      const { width, height } = Dimensions.get('window');
      const response = await apiClient.post('/users/report-bug', {
        title: bugTitle.trim(),
        description: bugDescription.trim(),
        device_info: {
          os: Platform.OS,
          os_version: String(Platform.Version),
          screen_dimensions: `${Math.round(width)}x${Math.round(height)}`,
          theme_mode: theme,
        }
      });

      setIsSubmittingBug(false);
      Keyboard.dismiss();
      bugSheetRef.current?.close();
      setBugTitle('');
      setBugDescription('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      
      if (response.data.status === 'submitted') {
        Alert.alert(
          'Bug Reported Successfully',
          `Thank you for your report! It has been submitted as GitHub Issue #${response.data.issue_number}.`
        );
      } else {
        Alert.alert(
          'Feedback Received',
          'Thank you! Your bug report has been logged successfully.'
        );
      }
    } catch (error: any) {
      setIsSubmittingBug(false);
      const serverError = error.response?.data?.error;
      const errMsg = typeof serverError === 'string'
        ? serverError
        : serverError?.message || 'Failed to submit bug report. Please check your internet connection and try again.';
      Alert.alert('Error', errMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const handleSendFeedback = async () => {
    if (!feedbackDescription.trim()) {
      Alert.alert('Required Field', 'Please describe your feedback.');
      return;
    }
    if (feedbackDescription.trim().length < 5) {
      Alert.alert('Validation Error', 'Feedback must be at least 5 characters.');
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const { width, height } = Dimensions.get('window');
      await apiClient.post('/support/feedback', {
        feedback_type: feedbackType,
        description: feedbackDescription.trim(),
        device_info: {
          os: Platform.OS,
          os_version: String(Platform.Version),
          screen_dimensions: `${Math.round(width)}x${Math.round(height)}`,
          theme_mode: theme,
        }
      });

      setIsSubmittingFeedback(false);
      Keyboard.dismiss();
      feedbackSheetRef.current?.close();
      setFeedbackDescription('');
      setFeedbackType('feature_request');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      
      Alert.alert(
        'Feedback Submitted',
        'Chale, thank you! Your feedback has been sent directly to the development team.'
      );
    } catch (error: any) {
      setIsSubmittingFeedback(false);
      const serverError = error.response?.data?.error;
      const errMsg = typeof serverError === 'string'
        ? serverError
        : serverError?.message || 'Failed to submit feedback. Please check your internet connection and try again.';
      Alert.alert('Error', errMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const saveName = async () => {
    const cleanName = newName.trim();
    if (!cleanName) {
      setIsEditingName(false);
      return;
    }
    
    const words = cleanName.split(/\s+/);
    if (words.length < 2) {
      Alert.alert('Invalid Name', 'Please enter both your first and last name.');
      return;
    }
    const invalidCharRegex = /[^a-zA-Z\s'-]/;
    if (invalidCharRegex.test(cleanName)) {
      Alert.alert('Invalid Name', 'Name can only contain letters, spaces, hyphens, and apostrophes.');
      return;
    }

    try {
      await apiClient.patch('/users/me', { full_name: cleanName });
      updateUser({ full_name: cleanName });
      setIsEditingName(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update name.');
    }
  };

  const handleUpgrade = async (plan: 'pro' | 'business', cycle: 'monthly' | 'yearly') => {
    if (isUpgrading) return;
    setIsUpgrading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    
    const planKey = cycle === 'yearly' ? `${plan}_yearly` : plan;
    
    try {
      const response = await apiClient.post('/billing/initialize', { plan: planKey });
      const { authorization_url } = response.data;
      
      pricingSheetRef.current?.close();
      
      // Open in-app browser for payment checkout
      await WebBrowser.openBrowserAsync(authorization_url);
      
      // Prompt user to verify once they complete checkout
      Alert.alert(
        'Verify Subscription',
        'Have you completed your payment on the checkout page?',
        [
          {
            text: 'Not Yet',
            style: 'cancel',
            onPress: () => setIsUpgrading(false)
          },
          {
            text: 'Yes, Verify',
            onPress: async () => {
              try {
                // Fetch latest user profile to verify premium status
                const profileResp = await apiClient.get('/users/me');
                updateUser(profileResp.data);
                if (profileResp.data.is_premium) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  Alert.alert('Success', 'Welcome to CediSmart Premium! Your features are now unlocked.');
                } else {
                  Alert.alert('Pending', 'We did not receive a payment success confirmation yet. If you paid, please wait a moment and try refreshing your profile in settings.');
                }
              } catch (verifyErr) {
                Alert.alert('Error', 'Failed to verify payment status. Please try refreshing settings.');
              } finally {
                setIsUpgrading(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.warn('[Upgrade] Initialize payment failed:', error);
      Alert.alert('Error', 'Failed to initialize payment gateway. Please try again.');
      setIsUpgrading(false);
    }
  };

  const handleStartTrial = async () => {
    if (isActivatingTrial) return;
    setIsActivatingTrial(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const response = await apiClient.post('/billing/start-trial');
      updateUser(response.data);
      Alert.alert('Trial Activated', 'Your 7-day free trial of CediSmart Pro has started! Enjoy full features.');
    } catch (err) {
      console.warn('Failed to start trial:', err);
      Alert.alert('Error', 'Unable to activate free trial at this time.');
    } finally {
      setIsActivatingTrial(false);
    }
  };

  const handleCancelPlan = () => {
    Alert.alert(
      user?.is_premium ? 'Cancel Subscription' : 'Opt-out of Trial',
      user?.is_premium 
        ? 'Are you sure you want to cancel your CediSmart Pro subscription? You will lose access to auto-sync and unlimited vaults immediately.'
        : 'Are you sure you want to end your free trial? You will return to the free tier immediately.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: user?.is_premium ? 'Cancel Subscription' : 'End Trial',
          style: 'destructive',
          onPress: async () => {
            setIsCancellingPlan(true);
            try {
              const response = await apiClient.post('/billing/cancel');
              updateUser(response.data);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert('Downgraded', 'Your plan has been cancelled successfully. You are now on the Free Tier.');
            } catch (err) {
              console.warn('Failed to cancel plan:', err);
              Alert.alert('Error', 'Unable to cancel your subscription at this time. Please check your network connection.');
            } finally {
              setIsCancellingPlan(false);
            }
          }
        }
      ]
    );
  };

  const handleManualSync = async () => {
    if (queue.length === 0) {
      Alert.alert('Offline Queue', 'Your offline queue is empty.');
      return;
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected || !netState.isInternetReachable) {
      Alert.alert('Offline', 'Please connect to the internet to sync offline transactions.');
      return;
    }

    setIsSyncing(true);
    const initialCount = queue.length;
    
    try {
      await syncTransactions();
      
      const newOfflineStore = useOfflineStore.getState();
      if (newOfflineStore.queue.length === 0) {
        Alert.alert('Sync Complete', 'All offline transactions successfully synced!');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        offlineQueueSheetRef.current?.close();
      } else if (newOfflineStore.queue.length < initialCount) {
        Alert.alert('Partial Sync', `Successfully synced ${initialCount - newOfflineStore.queue.length} items. ${newOfflineStore.queue.length} items remaining.`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      } else {
        Alert.alert('Sync Failed', 'Could not sync transactions with the server. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    } catch (err) {
      Alert.alert('Error', 'Sync failed. Please check your network and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportHistory = async () => {
    if (!user?.has_premium_access) {
      Alert.alert(
        'CediSmart Pro Feature',
        'Exporting transaction history is only available for Pro members. Upgrade now to get access!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: () => pricingSheetRef.current?.snapToIndex(0) }
        ]
      );
      return;
    }

    setIsExporting(true);
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert('Offline', 'Please connect to the internet to export transaction history.');
        setIsExporting(false);
        return;
      }

      // Fetch all transactions recursively
      let allTx: any[] = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const response = await apiClient.get(`/transactions/?page=${page}&per_page=100`);
        const { data, pagination } = response.data;
        allTx = [...allTx, ...data];
        if (allTx.length >= pagination.total || data.length === 0) {
          hasMore = false;
        } else {
          page++;
        }
      }

      if (allTx.length === 0) {
        Alert.alert('No Transactions', 'You do not have any transactions to export.');
        setIsExporting(false);
        return;
      }

      // Generate CSV Content
      const headers = ['Date', 'Type', 'Category', 'Account', 'Amount (₵)', 'Description', 'Notes'];
      const rows = allTx.map((tx: any) => {
        const date = tx.transaction_date;
        const type = tx.transaction_type ? tx.transaction_type.toUpperCase() : '';
        const categoryName = tx.category?.name || '';
        const accountName = tx.account?.name || '';
        const amount = tx.amount;
        const desc = tx.description ? `"${tx.description.replace(/"/g, '""')}"` : '';
        const notes = tx.notes ? `"${tx.notes.replace(/"/g, '""')}"` : '';
        
        return [date, type, categoryName, accountName, amount, desc, notes].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      
      const fileUri = `${FileSystem.documentDirectory}CediSmart_Transaction_History.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Transaction History',
          UTI: 'public.comma-separated-values-text',
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'An error occurred while exporting transaction history.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdfStatement = async () => {
    if (!user?.has_premium_access) {
      Alert.alert(
        'CediSmart Pro Feature',
        'Official Branded PDF Monthly Statements are only available for Pro members. Upgrade now to get access!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: () => pricingSheetRef.current?.snapToIndex(0) },
        ]
      );
      return;
    }

    setIsExportingPdf(true);
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert('Offline', 'Please connect to the internet to export your monthly statement.');
        setIsExportingPdf(false);
        return;
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

      const [sumRes, catRes, txRes] = await Promise.all([
        apiClient.get(`/reports/monthly?year=${currentYear}&month=${currentMonth}`),
        apiClient.get(
          `/reports/categories?start_date=${currentYear}-${String(currentMonth).padStart(2, '0')}-01&end_date=${new Date(currentYear, currentMonth, 0).toISOString().split('T')[0]}&transaction_type=expense`
        ),
        apiClient.get('/transactions/?per_page=100'),
      ]);

      const totalIncome = parseFloat(sumRes.data?.total_income || 0);
      const totalExpense = parseFloat(sumRes.data?.total_expense || 0);
      const netSavings = parseFloat(sumRes.data?.net_savings || 0);
      const savingsRate = parseFloat(sumRes.data?.savings_rate || 0);

      const categoryBreakdown = (catRes.data?.categories || []).map((c: any) => ({
        name: c.name,
        amount: parseFloat(c.amount || 0),
        percentage: parseFloat(c.percentage || 0),
      }));

      const transactions = (txRes.data?.data || []).map((t: any) => ({
        date: t.transaction_date,
        description: t.description || t.category?.name || 'Transaction',
        category: t.category?.name || 'General',
        account: t.account?.name || 'Wallet',
        type: t.transaction_type,
        amount: parseFloat(t.amount || 0),
      }));

      await generateAndSharePdfStatement({
        userName: user?.full_name || 'CediSmart Member',
        userPhone: user?.phone || '',
        monthName,
        totalIncome,
        totalExpense,
        netSavings,
        savingsRate,
        categoryBreakdown,
        transactions,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      console.error('PDF export error:', err);
      Alert.alert('Statement Error', 'An error occurred while generating your branded statement.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleSelectAppIcon = async (iconName: string) => {
    if (!user?.has_premium_access) {
      Alert.alert(
        'CediSmart Pro Feature',
        'Custom App Icons are only available for Pro members. Upgrade now to get access!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: () => pricingSheetRef.current?.snapToIndex(0) }
        ]
      );
      return;
    }

    try {
      const iconKeyMap: Record<string, string> = {
        'Classic Emerald': 'classic_emerald',
        'Luminous Emerald': 'luminous_emerald',
        'Pro Obsidian Gold': 'pro_obsidian_gold',
        'Sovereign Amber': 'sovereign_amber'
      };
      const iconKey = iconKeyMap[iconName] || 'classic_emerald';
      
      // Invoke native dynamic app icon library changer if available in this compiled build
      if (setAppIcon) {
        await setAppIcon(iconKey as any);
      } else {
        console.warn('setAppIcon is simulated in this development environment (non-compiled Expo Go).');
      }

      await AsyncStorage.setItem(`premium_app_icon_${user.id}`, iconName);
      setCurrentAppIcon(iconName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      appIconSheetRef.current?.close();
      Alert.alert('Icon Updated', `Your app icon visual theme has been updated to "${iconName}"!`);
    } catch (err) {
      console.warn('Native icon change error:', err);
      Alert.alert('Error', 'Failed to update app icon theme.');
    }
  };

  const handleAutoLockChange = () => {
    Alert.alert(
      'Auto-Lock Security',
      'Lock the app when backgrounded or after inactivity:',
      [
        { text: 'Never', onPress: () => saveAutoLockSetting('never') },
        { text: 'Immediately', onPress: () => saveAutoLockSetting('immediate') },
        { text: 'After 2 minutes', onPress: () => saveAutoLockSetting('2mins') },
        { text: 'After 5 minutes', onPress: () => saveAutoLockSetting('5mins') },
      ],
      { cancelable: true }
    );
  };

  const saveAutoLockSetting = async (val: string) => {
    if (user?.id) {
      await AsyncStorage.setItem(`app_lock_setting_${user.id}`, val);
      setAppLockSetting(val);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const getAutoLockLabel = (setting: string) => {
    switch (setting) {
      case 'immediate': return 'Immediately';
      case '2mins': return 'After 2 minutes';
      case '5mins': return 'After 5 minutes';
      default: return 'Never';
    }
  };

  const handleBudgetThresholdChange = () => {
    Alert.alert(
      'Budget Warning Threshold',
      'Trigger warning notifications when category spending reaches:',
      [
        { text: '50% of budget', onPress: () => saveBudgetThreshold(0.5) },
        { text: '75% of budget', onPress: () => saveBudgetThreshold(0.75) },
        { text: '80% of budget (Default)', onPress: () => saveBudgetThreshold(0.8) },
        { text: '90% of budget', onPress: () => saveBudgetThreshold(0.9) },
        { text: '100% of budget', onPress: () => saveBudgetThreshold(1.0) },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const saveBudgetThreshold = async (val: number) => {
    if (user?.id) {
      await AsyncStorage.setItem(`budget_alert_threshold_${user.id}`, val.toString());
      setBudgetThreshold(val);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-background'}`}>
      <CoinBackground />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Stage 2 Sticky Compact Top Navigation Bar */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              height: 30,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
            },
            stickyHeaderAnimatedStyle,
          ]}
        >
          <Text
            style={{
              color: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(17, 24, 39, 0.85)',
              fontSize: 15,
              fontWeight: '600',
              letterSpacing: -0.2,
            }}
          >
            Settings
          </Text>
        </Animated.View>

        <Animated.ScrollView
          ref={settingsScrollRef}
          className="flex-1 px-6"
          contentContainerStyle={{ paddingTop: 2, paddingBottom: tabBarClearance + 24 }}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          keyboardShouldPersistTaps="handled"
        >
          {/* Stage 1 & 2 Dynamic Large "Settings" Title */}
          <Animated.View style={largeTitleAnimatedStyle}>
            <Text
              style={{
                color: isDark ? '#ffffff' : '#1c221e',
                fontSize: 34,
                fontWeight: '700',
                letterSpacing: -0.6,
                lineHeight: 40,
                marginBottom: 10,
              }}
            >
              Settings
            </Text>
          </Animated.View>

          {/* Stage 1 Collapsible Apple-Style Search Bar */}
          <Animated.View style={[{ marginBottom: 12 }, searchBarAnimatedStyle]}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => settingsSearchInputRef.current?.focus()}
              style={{
                height: 38,
                borderRadius: 11,
                backgroundColor: isDark ? 'rgba(118, 118, 128, 0.24)' : 'rgba(118, 118, 128, 0.12)',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 11,
              }}
            >
              <Search size={17} color={isDark ? '#8E8E93' : '#6B7280'} style={{ marginRight: 7 }} />
              <TextInput
                ref={settingsSearchInputRef}
                value={settingsSearchQuery}
                onChangeText={setSettingsSearchQuery}
                placeholder="Search"
                placeholderTextColor={isDark ? '#8E8E93' : '#6B7280'}
                returnKeyType="search"
                style={{
                  flex: 1,
                  width: '100%',
                  color: isDark ? '#ffffff' : '#111827',
                  fontSize: 16,
                  paddingVertical: 0,
                }}
              />
              {settingsSearchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setSettingsSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: isDark ? '#636366' : '#9CA3AF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 6,
                  }}
                >
                  <X size={11} color={isDark ? '#1C1C1E' : '#ffffff'} strokeWidth={3} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setIsSupportModalVisible(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 6 }}
                >
                  <Mic size={17} color={isDark ? '#8E8E93' : '#6B7280'} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* PROFILE Section Title + Apple-Style Profile Card */}
          {matchesSearch('profile', 'account', 'name', 'phone', 'ghana card', 'kyc', 'switch profile', 'avatar', 'membership', 'premium', 'pro', 'business', 'trial', 'subscription', 'upgrade', 'plan', 'billing', user?.full_name || '', user?.phone || '') && (
            <View>
              <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-3 ml-1`}>Profile</Text>
              <SettingsGroup style={{ borderRadius: 20, marginBottom: 20 }}>
                {/* Top Row: Main CediSmart Account / Profile Row */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setNewName(user?.full_name || '');
                    setIsEditingName(false);
                    profileDetailSheetRef.current?.snapToIndex(0);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                  }}
                >
                  <Image
                    source={{ uri: userAvatarUri }}
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 31,
                      backgroundColor: isDark ? '#1f2937' : '#e5e7eb',
                    }}
                  />
                  <View style={{ flex: 1, marginLeft: 14, justifyContent: 'center' }}>
                    <Text
                      style={{
                        color: isDark ? '#ffffff' : '#111827',
                        fontSize: 20,
                        fontWeight: '700',
                        lineHeight: 25,
                        letterSpacing: -0.3,
                      }}
                      numberOfLines={2}
                    >
                      {user?.full_name || 'Set Your Name'}
                    </Text>
                    <Text
                      style={{
                        color: isDark ? '#98989F' : '#6B7280',
                        fontSize: 13,
                        lineHeight: 18,
                        marginTop: 3,
                      }}
                      numberOfLines={2}
                    >
                      {`CediSmart Account, ${user?.is_premium || effectiveTrialActive ? 'Pro' : 'Wallet'},\nand more`}
                    </Text>
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <ChevronRight size={18} color={isDark ? '#636366' : '#9CA3AF'} />
                  </View>
                </TouchableOpacity>

                {/* Apple Inset Hairline Separator */}
                <View
                  style={{
                    height: StyleSheet.hairlineWidth || 1,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)',
                    marginLeft: 92,
                  }}
                />

                {/* Bottom Row: Overlapping Avatars + Switch Profile (Apple Family Style) */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    switchSheetRef.current?.snapToIndex(0);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 11,
                  }}
                >
                  <View
                    style={{
                      width: 62,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Image
                      source={{ uri: userAvatarUri }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        borderWidth: 2,
                        borderColor: isDark ? '#141e18' : '#ffffff',
                        backgroundColor: isDark ? '#1f2937' : '#e5e7eb',
                        zIndex: 1,
                      }}
                    />
                    {(() => {
                      const secondaryAcc = savedAccounts.find((a) => a.phone !== user?.phone);
                      const secondaryUri = secondaryAcc ? accountAvatars[secondaryAcc.phone] : null;
                      if (secondaryUri) {
                        return (
                          <Image
                            source={{ uri: secondaryUri }}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              marginLeft: -10,
                              borderWidth: 2,
                              borderColor: isDark ? '#141e18' : '#ffffff',
                              backgroundColor: isDark ? '#1f2937' : '#e5e7eb',
                              zIndex: 2,
                            }}
                          />
                        );
                      }
                      return (
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            marginLeft: -10,
                            borderWidth: 2,
                            borderColor: isDark ? '#141e18' : '#ffffff',
                            backgroundColor: isDark ? '#1e3a29' : '#dcfce7',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 2,
                          }}
                        >
                          <Users size={14} color={isDark ? '#4ade80' : '#0d631b'} />
                        </View>
                      );
                    })()}
                  </View>
                  <View style={{ flex: 1, marginLeft: 14, justifyContent: 'center' }}>
                    <Text
                      style={{
                        color: isDark ? '#ffffff' : '#111827',
                        fontSize: 16,
                        fontWeight: '500',
                      }}
                    >
                      Switch Profile
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {savedAccounts.length > 1 && (
                      <Text
                        style={{
                          color: isDark ? '#8E8E93' : '#6B7280',
                          fontSize: 15,
                          marginRight: 6,
                        }}
                      >
                        {savedAccounts.length}
                      </Text>
                    )}
                    <ChevronRight size={18} color={isDark ? '#636366' : '#9CA3AF'} />
                  </View>
                </TouchableOpacity>
              </SettingsGroup>
            </View>
          )}

          {/* Tracked Financial Accounts Section */}
          {matchesSearch('tracked accounts', 'momo', 'mobile money', 'bank', 'cash', 'wallet', 'add account', 'manage') && (
          <View className="mt-4">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-3 ml-1`}>Tracked Accounts & MoMo</Text>
            <SettingsGroup>
              <SettingItem 
                icon={Landmark} 
                title="Cash, MoMo & Bank Accounts" 
                onPress={() => navigation.navigate('Accounts')} 
                isLast
              >
                <Text className={`font-bold text-base ${isLinked ? 'text-success' : isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                  {isLinked ? 'Manage' : 'Add Account'}
                </Text>
              </SettingItem>
            </SettingsGroup>
          </View>
          )}

          {/* Appearance Section */}
          {matchesSearch('appearance', 'dark', 'light', 'theme', 'device', 'system', 'mode') && (
          <View className="mt-4">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-3 ml-1`}>Appearance</Text>
            <SettingsGroup>
              <SettingItem 
                icon={Sun} 
                title="Light Theme" 
                value="Use light appearance"
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setThemeMode('none');
                }}
                hideChevron
                rightElement={
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: themeMode === 'none' ? (isDark ? '#4ade80' : '#0d631b') : (isDark ? '#4B5563' : '#9CA3AF'),
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                    }}
                  >
                    {themeMode === 'none' && (
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: isDark ? '#4ade80' : '#0d631b',
                        }}
                      />
                    )}
                  </View>
                }
              />
              <SettingItem 
                icon={Moon} 
                title="Dark Theme" 
                value="Use dark appearance"
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setThemeMode('dark');
                }}
                hideChevron
                rightElement={
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: themeMode === 'dark' ? (isDark ? '#4ade80' : '#0d631b') : (isDark ? '#4B5563' : '#9CA3AF'),
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                    }}
                  >
                    {themeMode === 'dark' && (
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: isDark ? '#4ade80' : '#0d631b',
                        }}
                      />
                    )}
                  </View>
                }
              />
              <SettingItem 
                icon={Smartphone} 
                title="Device Theme" 
                value="Match system appearance"
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setThemeMode('system');
                }}
                hideChevron
                rightElement={
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: themeMode === 'system' ? (isDark ? '#4ade80' : '#0d631b') : (isDark ? '#4B5563' : '#9CA3AF'),
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                    }}
                  >
                    {themeMode === 'system' && (
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: isDark ? '#4ade80' : '#0d631b',
                        }}
                      />
                    )}
                  </View>
                }
                isLast
              />
            </SettingsGroup>
          </View>
          )}

          {/* Security Section */}
          {matchesSearch('security', 'biometric', 'faceid', 'fingerprint', 'pin', 'password', 'auto-lock', 'lock') && (
          <View className="mt-4">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-3 ml-1`}>Security</Text>
            <SettingsGroup>
              <SettingItem 
                icon={Shield} 
                title="Biometric Login" 
                value={isBiometricSupported ? 'Use FaceID / Fingerprint' : 'Not supported'}
                onPress={() => isBiometricSupported && handleBiometricToggle(!isBiometricEnabled)}
                hideChevron
                rightElement={
                  isBiometricSupported ? (
                    <Switch 
                      value={isBiometricEnabled} 
                      onValueChange={handleBiometricToggle}
                      trackColor={{ false: theme === 'dark' ? '#374151' : '#D1D5DB', true: '#0d631b' }}
                    />
                  ) : undefined
                }
              />
              <SettingItem 
                icon={Shield} 
                title="Security PIN" 
                value="Change 6-digit PIN" 
                onPress={() => pinSheetRef.current?.snapToIndex(0)}
              />
              <SettingItem 
                icon={Shield} 
                title="Auto-Lock Setting" 
                value={getAutoLockLabel(appLockSetting)} 
                onPress={handleAutoLockChange}
                isLast
              />
            </SettingsGroup>
          </View>
          )}

          {/* Notifications Section */}
          {matchesSearch('notifications', 'sms', 'alerts', 'reminders', 'budget', 'warning', 'threshold') && (
          <View className="mt-4">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-3 ml-1`}>Notifications</Text>
            <SettingsGroup>
              <SettingItem
                icon={Bell}
                title="SMS Alert Reminders"
                value="Weekly SMS summaries"
                onPress={() => handleSmsAlertsToggle(!smsAlerts)}
                hideChevron
                rightElement={
                  <Switch 
                    value={smsAlerts} 
                    onValueChange={handleSmsAlertsToggle}
                    trackColor={{ false: theme === 'dark' ? '#374151' : '#D1D5DB', true: '#0d631b' }}
                  />
                }
                isLast={!budgetAlerts && !smsAlerts}
              />
              <SettingItem
                icon={Bell}
                title="Budget Alert Notifications"
                value="Send notification at limit"
                onPress={() => handleBudgetAlertsToggle(!budgetAlerts)}
                hideChevron
                rightElement={
                  <Switch 
                    value={budgetAlerts} 
                    onValueChange={handleBudgetAlertsToggle}
                    trackColor={{ false: theme === 'dark' ? '#374151' : '#D1D5DB', true: '#0d631b' }}
                  />
                }
                isLast={!budgetAlerts}
              />
              {budgetAlerts && (
                <SettingItem 
                  icon={Bell} 
                  title="Budget Warning Threshold" 
                  value={`${Math.round(budgetThreshold * 100)}% limit`} 
                  onPress={handleBudgetThresholdChange}
                  isLast
                />
              )}
            </SettingsGroup>
          </View>
          )}

          {/* Data Section */}
          {matchesSearch('data', 'storage', 'offline', 'queue', 'sync', 'export', 'csv', 'history', 'monthly', 'statement', 'pdf', 'app icon', 'icon', currentAppIcon) && (
          <View className="mt-4">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-3 ml-1`}>Data & Storage</Text>
            <SettingsGroup>
              <SettingItem 
                icon={Database} 
                title="Offline Queue" 
                value={`${queue.length} pending items`}
                onPress={() => offlineQueueSheetRef.current?.snapToIndex(0)}
              />
              <SettingItem 
                icon={isExporting ? ActivityIndicator : FileSpreadsheet} 
                title="Export History" 
                value={isExporting ? "Exporting data..." : "Export to CSV"} 
                onPress={isExporting ? undefined : handleExportHistory}
              />
              <SettingItem 
                icon={isExportingPdf ? ActivityIndicator : FileText} 
                title="Monthly Statement" 
                value={isExportingPdf ? "Generating PDF..." : "Export Official PDF"} 
                onPress={isExportingPdf ? undefined : handleExportPdfStatement}
              />
              <SettingItem 
                icon={Smartphone} 
                title="Premium App Icon" 
                value={currentAppIcon}
                onPress={() => {
                  if (user?.has_premium_access) {
                    appIconSheetRef.current?.snapToIndex(0);
                  } else {
                    Alert.alert(
                      'CediSmart Pro Feature',
                      'Custom App Icons are a premium feature. Upgrade to Pro to customize your home screen!',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Upgrade to Pro', onPress: () => pricingSheetRef.current?.snapToIndex(0) }
                      ]
                    );
                  }
                }}
                color={user?.has_premium_access ? "#4c56af" : undefined}
                isLast
              />
            </SettingsGroup>
          </View>
          )}

          {/* Guides Section */}
          {matchesSearch('guides', 'guide', 'how to use', 'docs', 'documentation', 'tutorial', 'momo', 'sms', 'auto-logging', 'safe-to-spend', 'budgets', '50/30/20', 'gestures', 'swipe', 'voice', 'offline', 'profiles', 'business', 'kyc') && (
          <View className="mt-4">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-3 ml-1`}>Guides</Text>
            <SettingsGroup>
              <SettingItem
                icon={Sparkles}
                color="#10b981"
                title="SMS Auto-Sync"
                value="Auto-log MoMo & bank alerts"
                onPress={() => openGuide('sms')}
              />
              <SettingItem
                icon={PieChart}
                color="#4c56af"
                title="Smart Budgets"
                value="Daily limits & 50/30/20 rule"
                onPress={() => openGuide('budgets')}
              />
              <SettingItem
                icon={Smartphone}
                color={isDark ? '#4ade80' : '#0d631b'}
                title="Voice & Gestures"
                value="Swipe actions & voice commands"
                onPress={() => openGuide('gestures')}
              />
              <SettingItem
                icon={Users}
                color="#d97706"
                title="Multi-Profile"
                value="Switch accounts & KYC limits"
                onPress={() => openGuide('profiles')}
              />
              <SettingItem
                icon={BookOpen}
                color={isDark ? '#60a5fa' : '#2563eb'}
                title="User Guide"
                value="How to use CediSmart"
                onPress={() => openWebDocs()}
                rightElement={
                  <ExternalLink size={18} color={isDark ? '#60a5fa' : '#2563eb'} />
                }
                isLast
              />
            </SettingsGroup>
          </View>
          )}

          {/* Support Section */}
          {matchesSearch('support', 'bug', 'report', 'ai', 'assistant', 'help', 'chat', 'feedback', 'review', 'suggest') && (
          <View className="mt-4">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-3 ml-1`}>Support</Text>
            <SettingsGroup>
              <SettingItem 
                icon={Bug} 
                title="Report a Bug" 
                value="Submit issues to developers" 
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  bugSheetRef.current?.snapToIndex(0);
                }}
              />
              <SettingItem 
                icon={Headphones} 
                color={isDark ? '#4ade80' : '#0d631b'}
                title="AI Support Assistant" 
                value="Chat with CediSmart AI helper" 
                onPress={() => setIsSupportModalVisible(true)}
              />
              <SettingItem 
                icon={MessageSquare} 
                title="Share Feedback" 
                value="Suggest features or send reviews" 
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  feedbackSheetRef.current?.snapToIndex(0);
                }}
                isLast
              />
            </SettingsGroup>
          </View>
          )}

          {/* Danger Zone */}
          {matchesSearch('account actions', 'logout', 'sign out', 'delete account', 'remove', 'danger') && (
          <View className="mt-8 mb-6">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-3 ml-1`}>Account Actions</Text>
            <SettingsGroup>
              <TouchableOpacity 
                onPress={handleLogout}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 18,
                  paddingVertical: 15,
                  width: '100%',
                }}
              >
                <View
                  className={`w-10 h-10 rounded-full ${isDark ? 'bg-white/10' : 'bg-black/5'} items-center justify-center`}
                  style={{ marginRight: 14, flexShrink: 0 }}
                >
                  <LogOut size={20} color={isDark ? '#e1e3e0' : '#1C1C2E'} />
                </View>
                <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base flex-1`}>Logout</Text>
                <ChevronRight size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
              </TouchableOpacity>
              <View
                style={{
                  height: StyleSheet.hairlineWidth || 1,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  marginLeft: 72,
                }}
              />
              <TouchableOpacity 
                onPress={handleDeleteAccount}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 18,
                  paddingVertical: 15,
                  width: '100%',
                }}
              >
                <View
                  className="w-10 h-10 rounded-full bg-red-500/15 items-center justify-center"
                  style={{ marginRight: 14, flexShrink: 0 }}
                >
                  <Trash2 size={20} color="#DC2626" />
                </View>
                <Text className="text-error font-bold text-base flex-1">Delete Account</Text>
                <ChevronRight size={20} color="#DC2626" />
              </TouchableOpacity>
            </SettingsGroup>
          </View>
          )}
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* Report a Bug Bottom Sheet */}
      <BottomSheet
        ref={bugSheetRef}
        index={-1}
        snapPoints={['72%', '92%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundComponent={GlassSheetBackground}
        onClose={() => Keyboard.dismiss()}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View className="px-6 py-4">
              {/* Sheet Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 12 }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.10)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Bug size={19} color="#EF4444" />
                  </View>
                  <Text
                    style={{
                      color: isDark ? '#ffffff' : '#111827',
                      fontSize: 20,
                      fontWeight: '700',
                      letterSpacing: -0.3,
                    }}
                    numberOfLines={1}
                  >
                    Report a Bug
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    bugSheetRef.current?.close();
                  }}
                >
                  <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-base`}>Cancel</Text>
                </TouchableOpacity>
              </View>

              {/* Subtitle */}
              <Text
                style={{
                  color: isDark ? '#98989F' : '#6B7280',
                  fontSize: 13.5,
                  lineHeight: 19,
                  marginBottom: 20,
                }}
              >
                Help us improve CediSmart. Describe what happened and our engineering team will track and resolve it right away.
              </Text>

              {/* Bug Title Field */}
              <Text
                style={{
                  color: isDark ? '#8E8E93' : '#6B7280',
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 7,
                  marginLeft: 4,
                }}
              >
                Issue Summary
              </Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => bugTitleInputRef.current?.focus()}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(164, 243, 185, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                  backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : '#ffffff',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  marginBottom: 18,
                }}
              >
                <BottomSheetTextInput
                  ref={bugTitleInputRef}
                  value={bugTitle}
                  onChangeText={setBugTitle}
                  placeholder="e.g. App freezes when exporting statement"
                  placeholderTextColor={isDark ? '#636366' : '#9CA3AF'}
                  returnKeyType="next"
                  onSubmitEditing={() => bugDescInputRef.current?.focus()}
                  selectionColor={isDark ? '#4ade80' : '#0d631b'}
                  style={{
                    flex: 1,
                    width: '100%',
                    color: isDark ? '#ffffff' : '#111827',
                    fontSize: 15.5,
                    fontWeight: '500',
                    paddingVertical: 0,
                  }}
                />
              </TouchableOpacity>

              {/* Bug Description Field */}
              <Text
                style={{
                  color: isDark ? '#8E8E93' : '#6B7280',
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 7,
                  marginLeft: 4,
                }}
              >
                Details & Steps to Reproduce
              </Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => bugDescInputRef.current?.focus()}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(164, 243, 185, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                  backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : '#ffffff',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 132,
                  marginBottom: 22,
                }}
              >
                <BottomSheetTextInput
                  ref={bugDescInputRef}
                  value={bugDescription}
                  onChangeText={setBugDescription}
                  placeholder="Describe what happened, the steps you took, and any error message you saw..."
                  placeholderTextColor={isDark ? '#636366' : '#9CA3AF'}
                  multiline
                  textAlignVertical="top"
                  selectionColor={isDark ? '#4ade80' : '#0d631b'}
                  style={{
                    flex: 1,
                    width: '100%',
                    minHeight: 104,
                    color: isDark ? '#ffffff' : '#111827',
                    fontSize: 15,
                    lineHeight: 21,
                    paddingVertical: 0,
                  }}
                />
              </TouchableOpacity>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleReportBug}
                disabled={isSubmittingBug}
                activeOpacity={0.85}
                className={`w-full py-4 rounded-2xl flex-row justify-center items-center shadow-lg ${
                  isSubmittingBug ? 'bg-gray-400' : 'bg-primary shadow-primary/25'
                }`}
              >
                {isSubmittingBug ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Text className="text-white font-bold text-base mr-2">Submit Bug Report</Text>
                    <Check size={18} color="white" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Share Feedback Bottom Sheet */}
      <BottomSheet
        ref={feedbackSheetRef}
        index={-1}
        snapPoints={['72%', '92%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundComponent={GlassSheetBackground}
        onClose={() => Keyboard.dismiss()}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View className="px-6 py-4">
              {/* Sheet Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 12 }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: isDark ? 'rgba(74, 222, 128, 0.16)' : 'rgba(13, 99, 27, 0.10)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <MessageSquare size={19} color={isDark ? '#4ade80' : '#0D631B'} />
                  </View>
                  <Text
                    style={{
                      color: isDark ? '#ffffff' : '#111827',
                      fontSize: 20,
                      fontWeight: '700',
                      letterSpacing: -0.3,
                    }}
                    numberOfLines={1}
                  >
                    Share Feedback
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    feedbackSheetRef.current?.close();
                  }}
                >
                  <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-base`}>Cancel</Text>
                </TouchableOpacity>
              </View>

              {/* Subtitle */}
              <Text
                style={{
                  color: isDark ? '#98989F' : '#6B7280',
                  fontSize: 13.5,
                  lineHeight: 19,
                  marginBottom: 20,
                }}
              >
                Help us shape CediSmart! Share a feature request, suggestion, or review directly with our product team.
              </Text>

              {/* Apple-Style Segmented Control for Feedback Category */}
              <Text
                style={{
                  color: isDark ? '#8E8E93' : '#6B7280',
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                  marginLeft: 4,
                }}
              >
                Category
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  borderRadius: 13,
                  padding: 3,
                  backgroundColor: isDark ? 'rgba(118, 118, 128, 0.24)' : 'rgba(118, 118, 128, 0.12)',
                  marginBottom: 20,
                }}
              >
                {[
                  { key: 'feature_request', label: '🚀 Feature' },
                  { key: 'suggestion', label: '💡 Suggestion' },
                  { key: 'other', label: '💬 Review' },
                ].map((opt) => {
                  const active = feedbackType === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      activeOpacity={0.8}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setFeedbackType(opt.key);
                      }}
                      style={[
                        {
                          flex: 1,
                          paddingVertical: 9,
                          paddingHorizontal: 6,
                          borderRadius: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                        active && {
                          backgroundColor: isDark ? '#2C2C2E' : '#ffffff',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: isDark ? 0.35 : 0.12,
                          shadowRadius: 3,
                          elevation: 2,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active
                            ? isDark
                              ? '#ffffff'
                              : '#111827'
                            : isDark
                            ? '#98989F'
                            : '#6B7280',
                          fontSize: 12.5,
                          fontWeight: active ? '700' : '600',
                        }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Feedback Description Field */}
              <Text
                style={{
                  color: isDark ? '#8E8E93' : '#6B7280',
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 7,
                  marginLeft: 4,
                }}
              >
                Your Message
              </Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => feedbackDescInputRef.current?.focus()}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(164, 243, 185, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                  backgroundColor: isDark ? 'rgba(20, 30, 24, 0.90)' : '#ffffff',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 140,
                  marginBottom: 22,
                }}
              >
                <BottomSheetTextInput
                  ref={feedbackDescInputRef}
                  value={feedbackDescription}
                  onChangeText={setFeedbackDescription}
                  placeholder="Tell us what you'd love to see or how we can make CediSmart even better..."
                  placeholderTextColor={isDark ? '#636366' : '#9CA3AF'}
                  multiline
                  textAlignVertical="top"
                  selectionColor={isDark ? '#4ade80' : '#0d631b'}
                  style={{
                    flex: 1,
                    width: '100%',
                    minHeight: 112,
                    color: isDark ? '#ffffff' : '#111827',
                    fontSize: 15,
                    lineHeight: 21,
                    paddingVertical: 0,
                  }}
                />
              </TouchableOpacity>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleSendFeedback}
                disabled={isSubmittingFeedback}
                activeOpacity={0.85}
                className={`w-full py-4 rounded-2xl flex-row justify-center items-center shadow-lg ${
                  isSubmittingFeedback ? 'bg-gray-400' : 'bg-primary shadow-primary/25'
                }`}
              >
                {isSubmittingFeedback ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Text className="text-white font-bold text-base mr-2">Submit Feedback</Text>
                    <Check size={18} color="white" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Change PIN Bottom Sheet */}
      <BottomSheet
        ref={pinSheetRef}
        index={-1}
        snapPoints={['90%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        onClose={resetPinForm}
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 36 }}>
          <View className="px-6 py-3 items-center">
            <View className="w-full flex-row justify-between items-center mb-5">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Change PIN</Text>
              <TouchableOpacity onPress={() => pinSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View className="items-center w-full mb-5">
              {/* Step indicator/header */}
              <Text className={`text-xs font-bold ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider mb-3`}>
                {pinStep === 1 ? 'Enter Current PIN' : pinStep === 2 ? 'Enter New PIN' : 'Confirm New PIN'}
              </Text>

              {/* Dots */}
              <View className="flex-row justify-center space-x-4 mb-2">
                {[...Array(6)].map((_, i) => {
                  let filled = false;
                  if (pinStep === 1) filled = i < currentPin.length;
                  else if (pinStep === 2) filled = i < newPin.length;
                  else filled = i < confirmPin.length;
                  
                  return (
                    <View
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 ${isDark ? 'border-[#4ade80]' : 'border-primary'} ${filled ? (isDark ? 'bg-[#4ade80]' : 'bg-primary') : 'bg-transparent'}`}
                    />
                  );
                })}
              </View>

              {pinError ? (
                <Text className="text-error text-sm font-semibold mt-2 text-center">{pinError}</Text>
              ) : null}
            </View>

            <PINPad 
              onPress={handlePinPress} 
              onBackspace={handlePinBackspace} 
            />
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
      {/* Ghana Card Verification Bottom Sheet */}
      <BottomSheet
        ref={kycSheetRef}
        index={-1}
        snapPoints={['85%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        onClose={() => {
          setCardNum('');
          setFullNameKyc('');
          setDobKyc('');
          setKycError('');
        }}
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 36 }}>
          <View className="px-6 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Verify Identity</Text>
              <TouchableOpacity onPress={() => kycSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-body text-xs mb-6 leading-relaxed`}>
              Verify your identity with your Ghana Card (National ID) to upgrade to Tier 1 transaction limits.
            </Text>

            {/* Verification Form */}
            <View className="space-y-4">
              <View>
                <Text className={`text-xs font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>Ghana Card Number</Text>
                <TextInput
                  className={`${isDark ? 'bg-black/25 border-white/15 text-dark-charcoal' : 'bg-white border-gray-100 text-charcoal'} px-4 py-4 rounded-xl border text-base shadow-sm`}
                  placeholder="GHA-123456789-0"
                  placeholderTextColor={theme === 'dark' ? '#6b7280' : '#D1D5DB'}
                  value={cardNum}
                  onChangeText={(val) => setCardNum(val.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={15}
                  editable={!isVerifying}
                />
              </View>

              <View>
                <Text className={`text-xs font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>Full Name (as on card)</Text>
                <TextInput
                  className={`${isDark ? 'bg-black/25 border-white/15 text-dark-charcoal' : 'bg-white border-gray-100 text-charcoal'} px-4 py-4 rounded-xl border text-base shadow-sm`}
                  placeholder="e.g. Kofi Mensah"
                  placeholderTextColor={theme === 'dark' ? '#6b7280' : '#D1D5DB'}
                  value={fullNameKyc}
                  onChangeText={setFullNameKyc}
                  editable={!isVerifying}
                />
              </View>

              <View>
                <Text className={`text-xs font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>Date of Birth</Text>
                <TextInput
                  className={`${isDark ? 'bg-black/25 border-white/15 text-dark-charcoal' : 'bg-white border-gray-100 text-charcoal'} px-4 py-4 rounded-xl border text-base shadow-sm`}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme === 'dark' ? '#6b7280' : '#D1D5DB'}
                  value={dobKyc}
                  onChangeText={setDobKyc}
                  editable={!isVerifying}
                />
              </View>

              {kycError ? (
                <Text className="text-error text-sm font-semibold mt-2 text-center">{kycError}</Text>
              ) : null}

              <View className="mt-8">
                <TouchableOpacity
                   onPress={handleKycVerification}
                   disabled={isVerifying}
                   className={`w-full py-4 rounded-xl items-center justify-center shadow-lg ${
                     isVerifying ? 'bg-gray-300' : 'bg-primary shadow-primary/30'
                   }`}
                >
                  <Text className="text-white font-bold text-base">
                    {isVerifying ? 'Connecting to NIA gateway...' : 'Verify Now'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Biometric PIN Verification Bottom Sheet */}
      <BottomSheet
        ref={biometricPinSheetRef}
        index={-1}
        snapPoints={['90%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        onClose={() => {
          setBiometricPin('');
          setBiometricPinError('');
        }}
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 36 }}>
          <View className="px-6 py-3 items-center">
            <View className="w-full flex-row justify-between items-center mb-5">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Enable Biometrics</Text>
              <TouchableOpacity onPress={() => biometricPinSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View className="items-center w-full mb-5">
              <Text className={`text-xs font-bold ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider mb-3`}>
                Enter Security PIN to Confirm
              </Text>

              {/* Dots */}
              <View className="flex-row justify-center space-x-4 mb-2">
                {[...Array(6)].map((_, i) => (
                  <View
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 ${isDark ? 'border-[#4ade80]' : 'border-primary'} ${i < biometricPin.length ? (isDark ? 'bg-[#4ade80]' : 'bg-primary') : 'bg-transparent'}`}
                  />
                ))}
              </View>

              {biometricPinError ? (
                <Text className="text-error text-sm font-semibold mt-2 text-center">{biometricPinError}</Text>
              ) : null}
            </View>

            <PINPad 
              onPress={handleBiometricPinPress} 
              onBackspace={handleBiometricPinBackspace} 
              disabled={isVerifyingBiometricPin}
            />
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Switch Account Bottom Sheet */}
      <BottomSheet
        ref={switchSheetRef}
        index={-1}
        snapPoints={['65%', '90%']}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
        enablePanDownToClose
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}>
          <View className="px-6 py-4">
            <View className="w-full flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Switch Profile</Text>
              <TouchableOpacity onPress={() => switchSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Current Active Account Info */}
            <View className={`w-full ${isDark ? 'bg-[#222a23] border-primary/20' : 'bg-primary/5 border-primary/10'} p-4 rounded-2xl border flex-row items-center mb-6`}>
              <View className="w-10 h-10 rounded-full bg-primary items-center justify-center mr-3 overflow-hidden">
                {user?.id && accountAvatars[user?.phone || ''] ? (
                  <Image 
                    source={{ uri: accountAvatars[user?.phone || ''] }} 
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text className="text-white font-headline font-bold text-sm">
                    {(user?.full_name || '')
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2) || 'CS'}
                  </Text>
                )}
              </View>
              <View className="flex-1">
                <Text className={`font-headline font-bold text-sm ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>{user?.full_name || 'Active Profile'}</Text>
                <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{user?.phone} (Active)</Text>
              </View>
            </View>

            {/* Saved Accounts list */}
            {savedAccounts.length > 1 ? (
              <View className="w-full mb-6">
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3 ml-1`}>
                  Other Profiles
                </Text>
                {savedAccounts
                  .filter((acc) => acc.phone !== user?.phone)
                  .map((acc) => (
                    <View 
                      key={acc.phone} 
                      className={`flex-row items-center justify-between p-4 mb-2 rounded-2xl border ${
                        isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'
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
            ) : (
              <View className="items-center py-6 mb-6">
                <Text className={`font-headline text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} text-center`}>
                  No other saved profiles on this device.
                </Text>
              </View>
            )}

            {/* Add Account Option */}
            <TouchableOpacity
              onPress={handleAddAccount}
              className={`w-full py-4 border-2 border-dashed ${
                isDark ? 'border-[#4ade80]/40 bg-[#1f2920]' : 'border-primary/30 bg-primary/5'
              } rounded-2xl items-center justify-center mb-6 flex-row space-x-2`}
            >
              <Plus size={18} color={isDark ? '#4ade80' : '#16a34a'} />
              <Text className={`font-headline font-bold text-sm ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>
                Add Another Account
              </Text>
            </TouchableOpacity>

          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Plans & Pricing Bottom Sheet */}
      <BottomSheet
        ref={pricingSheetRef}
        index={-1}
        snapPoints={['90%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}>
          <View className="px-6 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Choose Your Plan</Text>
              <TouchableOpacity onPress={() => pricingSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-sm`}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs leading-relaxed mb-6`}>
              Select a plan to unlock advanced features. Your subscription directly supports the development of CediSmart!
            </Text>

            {/* Billing Cycle Toggle */}
            <View className={`flex-row p-1 rounded-2xl mb-6 ${isDark ? 'bg-dark-surface-container' : 'bg-gray-100'}`}>
              <TouchableOpacity
                onPress={() => setBillingCycle('monthly')}
                className={`flex-1 py-3 items-center rounded-xl ${billingCycle === 'monthly' ? 'bg-primary shadow-sm' : ''}`}
              >
                <Text className={`font-bold text-xs ${billingCycle === 'monthly' ? 'text-white' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Monthly Billing
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setBillingCycle('yearly')}
                className={`flex-1 py-3 items-center rounded-xl flex-row justify-center ${billingCycle === 'yearly' ? 'bg-primary shadow-sm' : ''}`}
              >
                <Text className={`font-bold text-xs ${billingCycle === 'yearly' ? 'text-white' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Yearly Billing
                </Text>
                <View className="ml-1.5 bg-yellow-500/20 px-1.5 py-0.5 rounded-full">
                  <Text className="text-[9px] font-bold text-yellow-500">SAVE 33%</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Plan Cards */}
            <View className="space-y-4">
              {/* Pro Plan */}
              <TouchableOpacity
                onPress={() => setSelectedPlan('pro')}
                className={`p-5 rounded-2xl border-2 flex-row justify-between items-start ${
                  selectedPlan === 'pro'
                    ? 'border-primary bg-primary/5'
                    : isDark ? 'border-dark-outline-variant/10 bg-dark-surface-container-lowest' : 'border-gray-100 bg-white'
                }`}
              >
                <View className="flex-1 mr-4">
                  <View className="flex-row items-center mb-1">
                    <Text className={`text-lg font-bold ${isDark ? 'text-white' : 'text-charcoal'}`}>CediSmart Pro</Text>
                    <View className="ml-2 bg-primary/20 px-2 py-0.5 rounded-full">
                      <Text className={`text-[10px] font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>Popular</Text>
                    </View>
                  </View>
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mb-3 leading-relaxed`}>
                    Perfect for individuals looking for automated Mobile Money syncing and personal budgeting.
                  </Text>
                  
                  {/* Features */}
                  <View className="space-y-2">
                    <View className="flex-row items-center">
                      <Check size={12} color={isDark ? '#4ade80' : '#0A6E4A'} className="mr-2" />
                      <Text className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Auto SMS Sync (Android & iOS)</Text>
                    </View>
                    <View className="flex-row items-center">
                      <Check size={12} color={isDark ? '#4ade80' : '#0A6E4A'} className="mr-2" />
                      <Text className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Unlimited Financial Accounts</Text>
                    </View>
                    <View className="flex-row items-center">
                      <Check size={12} color={isDark ? '#4ade80' : '#0A6E4A'} className="mr-2" />
                      <Text className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Unlimited Budget Categories</Text>
                    </View>
                    <View className="flex-row items-center">
                      <Check size={12} color={isDark ? '#4ade80' : '#0A6E4A'} className="mr-2" />
                      <Text className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>CSV & PDF Exports</Text>
                    </View>
                  </View>
                </View>
                <View className="items-end">
                  <Text className={`text-2xl font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>
                    ₵{billingCycle === 'monthly' ? '15' : '120'}
                  </Text>
                  <Text className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    per {billingCycle === 'monthly' ? 'month' : 'year'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Business Plan */}
              <TouchableOpacity
                onPress={() => setSelectedPlan('business')}
                className={`p-5 rounded-2xl border-2 flex-row justify-between items-start ${
                  selectedPlan === 'business'
                    ? 'border-primary bg-primary/5'
                    : isDark ? 'border-dark-outline-variant/10 bg-dark-surface-container-lowest' : 'border-gray-100 bg-white'
                }`}
              >
                <View className="flex-1 mr-4">
                  <Text className={`text-lg font-bold ${isDark ? 'text-white' : 'text-charcoal'} mb-1`}>CediBusiness</Text>
                  <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs mb-3 leading-relaxed`}>
                    Designed for micro-shops, merchant lines, and sharing ledgers with shop attendants.
                  </Text>
                  
                  {/* Features */}
                  <View className="space-y-2">
                    <View className="flex-row items-center">
                      <Check size={12} color={isDark ? '#4ade80' : '#0A6E4A'} className="mr-2" />
                      <Text className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>All Pro Features Included</Text>
                    </View>
                    <View className="flex-row items-center">
                      <Check size={12} color={isDark ? '#4ade80' : '#0A6E4A'} className="mr-2" />
                      <Text className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Merchant & Agent Line Sync</Text>
                    </View>
                    <View className="flex-row items-center">
                      <Check size={12} color={isDark ? '#4ade80' : '#0A6E4A'} className="mr-2" />
                      <Text className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>WhatsApp Invoice Generator</Text>
                    </View>
                    <View className="flex-row items-center">
                      <Check size={12} color={isDark ? '#4ade80' : '#0A6E4A'} className="mr-2" />
                      <Text className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Share Ledger with 2 Attendants</Text>
                    </View>
                  </View>
                </View>
                <View className="items-end">
                  <Text className={`text-2xl font-bold ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>
                    ₵{billingCycle === 'monthly' ? '49' : '399'}
                  </Text>
                  <Text className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    per {billingCycle === 'monthly' ? 'month' : 'year'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Subscribe CTA */}
            <TouchableOpacity
              onPress={() => handleUpgrade(selectedPlan, billingCycle)}
              disabled={isUpgrading}
              className={`w-full py-4 mt-8 rounded-xl items-center justify-center shadow-lg ${
                isUpgrading ? 'bg-gray-300' : 'bg-primary shadow-primary/30'
              }`}
            >
              {isUpgrading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white font-bold text-base">
                  Get Started with {selectedPlan === 'pro' ? 'Pro' : 'Business'}
                </Text>
              )}
            </TouchableOpacity>

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
                onPress={handleSwitchPinDigitPress}
                onBackspace={handleSwitchPinBackspace}
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

      {/* Offline Queue Bottom Sheet */}
      <BottomSheet
        ref={offlineQueueSheetRef}
        index={-1}
        snapPoints={['65%', '90%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}>
          <View className="px-6 py-4">
            <View className="w-full flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Offline Queue</Text>
              <TouchableOpacity onPress={() => offlineQueueSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Network Status Banner */}
            <View className={`w-full flex-row items-center p-4 mb-6 rounded-2xl border ${
              isOnline 
                ? (isDark ? 'bg-green-950/20 border-green-900/30' : 'bg-green-50 border-green-100')
                : (isDark ? 'bg-yellow-950/20 border-yellow-900/30' : 'bg-yellow-50 border-yellow-100')
            }`}>
              <View className="mr-3">
                {isOnline ? (
                  <Wifi size={20} color="#16A34A" />
                ) : (
                  <WifiOff size={20} color="#CA8A04" />
                )}
              </View>
              <View className="flex-1">
                <Text className={`font-headline font-bold text-sm ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                  {isOnline ? 'Online Status' : 'Offline Mode'}
                </Text>
                <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {isOnline ? 'Connected to CediSmart cloud servers.' : 'Transactions will sync automatically when online.'}
                </Text>
              </View>
            </View>

            {/* Queue List */}
            {queue.length > 0 ? (
              <View className="space-y-4 mb-8">
                <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-2 ml-1`}>
                  Pending Sync Items ({queue.length})
                </Text>
                {queue.map((item, idx) => {
                  const cat = categoryMap.get(item.category_id);
                  const acc = accountMap.get(item.account_id);
                  const isExpense = item.transaction_type === 'expense';
                  
                  return (
                    <View 
                      key={item.client_id || idx} 
                      className={`p-4 rounded-2xl border ${
                        isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'
                      }`}
                    >
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className={`font-headline font-bold text-sm ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                          {cat?.name || 'Uncategorized'}
                        </Text>
                        <Text className={`font-headline font-bold text-sm ${isExpense ? 'text-error' : 'text-success'}`}>
                          {isExpense ? '-' : '+'}{formatGHS(item.amount)}
                        </Text>
                      </View>
                      
                      <View className="flex-row justify-between items-center">
                        <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {acc?.name || 'Account'} • {item.transaction_date}
                        </Text>
                        {item.description ? (
                          <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} italic max-w-[150px]`} numberOfLines={1}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="items-center py-12 mb-8 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                <Database size={40} color={isDark ? '#4b5563' : '#9ca3af'} />
                <Text className={`font-headline text-base ${isDark ? 'text-gray-400' : 'text-gray-500'} font-bold mt-4`}>
                  All caught up!
                </Text>
                <Text className={`font-body text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mt-1 text-center px-6`}>
                  There are no pending transactions waiting to sync.
                </Text>
              </View>
            )}

            {/* Manual Sync Actions */}
            {queue.length > 0 ? (
              <View className="space-y-3">
                <TouchableOpacity
                  onPress={handleManualSync}
                  disabled={isSyncing}
                  className={`w-full py-4 rounded-xl items-center justify-center flex-row space-x-2 shadow-lg ${
                    isSyncing ? 'bg-gray-300' : 'bg-primary shadow-primary/30'
                  }`}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <RefreshCw size={16} color="#ffffff" />
                      <Text className="text-white font-bold text-base">Sync Offline Queue Now</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      'Clear Offline Queue',
                      'Are you sure you want to delete all offline transactions? This action cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Clear All', 
                          style: 'destructive', 
                          onPress: () => {
                            clearQueue();
                            offlineQueueSheetRef.current?.close();
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                          } 
                        }
                      ]
                    );
                  }}
                  className={`w-full py-4 rounded-xl items-center justify-center border ${
                    isDark ? 'border-red-900/30 bg-red-950/10' : 'border-red-100 bg-red-50/50'
                  }`}
                >
                  <Text className="text-error font-bold text-base">Purge Offline Queue</Text>
                </TouchableOpacity>
              </View>
            ) : null}

          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Premium App Icon Picker Bottom Sheet */}
      <BottomSheet
        ref={appIconSheetRef}
        index={-1}
        snapPoints={['65%', '85%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}>
          <View className="px-6 py-4">
            <View className="w-full flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Premium App Icon</Text>
              <TouchableOpacity onPress={() => appIconSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-6`}>
              Select a visual theme for your CediSmart app icon.
            </Text>

            {/* App Icon options */}
            <View className="space-y-3">
              {[
                { name: 'Classic Emerald', color: '#0d631b', desc: 'Premium forest green brand icon with gold text.' },
                { name: 'Luminous Emerald', color: '#16a34a', desc: 'Premium dark forest green with glowing neon borders.' },
                { name: 'Pro Obsidian Gold', color: '#DAA520', desc: 'Luxury black gold theme for Pro members.' },
                { name: 'Sovereign Amber', color: '#d97706', desc: 'Premium glowing amber gold theme for Pro members.' }
              ].map((iconOpt) => {
                const isSelected = currentAppIcon === iconOpt.name;
                return (
                  <TouchableOpacity
                    key={iconOpt.name}
                    onPress={() => handleSelectAppIcon(iconOpt.name)}
                    className={`flex-row items-center p-4 rounded-2xl border ${
                      isSelected 
                        ? (isDark ? 'bg-primary/10 border-primary' : 'bg-primary/5 border-primary')
                        : (isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100')
                    }`}
                  >
                    {/* Simulated Icon Art */}
                    <View 
                      style={{ backgroundColor: iconOpt.color }}
                      className="w-12 h-12 rounded-xl items-center justify-center mr-4 shadow-sm"
                    >
                      <Text className="text-white font-headline font-black text-xl">₵</Text>
                    </View>
                    
                    <View className="flex-1">
                      <Text className={`font-headline font-bold text-base ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                        {iconOpt.name}
                      </Text>
                      <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {iconOpt.desc}
                      </Text>
                    </View>

                    {isSelected ? (
                      <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                        <Check size={14} color="#ffffff" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Apple-Style CediSmart Account Detail Bottom Sheet */}
      <BottomSheet
        ref={profileDetailSheetRef}
        index={-1}
        snapPoints={['72%', '90%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="px-6 py-4">
            <View className="w-full flex-row justify-between items-center mb-4">
              <Text className={`text-xl font-headline font-bold ${isDark ? 'text-white' : 'text-charcoal'}`}>
                CediSmart Account
              </Text>
              <TouchableOpacity onPress={() => profileDetailSheetRef.current?.close()}>
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-base`}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Centered Apple Account Hero Header */}
            <View className="items-center my-4">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleProfileAvatarPress}
                className="relative mb-2"
              >
                <Image
                  source={{ uri: userAvatarUri }}
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    backgroundColor: isDark ? '#1f2937' : '#e5e7eb',
                  }}
                />
                <View
                  className={`absolute bottom-0 right-0 w-7 h-7 bg-primary rounded-full items-center justify-center border-2 ${isDark ? 'border-dark-surface-container-lowest' : 'border-white'} shadow-lg`}
                >
                  <Plus size={16} color="white" />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleProfileAvatarPress} className="mb-2">
                <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} text-xs font-bold`}>
                  Edit Photo
                </Text>
              </TouchableOpacity>
              {isEditingName ? (
                <TextInput
                  ref={nameInputRef}
                  style={{
                    color: isDark ? '#ffffff' : '#111827',
                    fontSize: 22,
                    fontWeight: '700',
                    textAlign: 'center',
                    paddingVertical: 2,
                    minWidth: 200,
                  }}
                  selectionColor={isDark ? '#4ade80' : '#0d631b'}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  onBlur={saveName}
                  onSubmitEditing={saveName}
                  returnKeyType="done"
                />
              ) : (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    setIsEditingName(true);
                    setTimeout(() => nameInputRef.current?.focus(), 60);
                  }}
                >
                  <Text
                    style={{
                      color: isDark ? '#ffffff' : '#111827',
                      fontSize: 22,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    {user?.full_name || 'Set Your Name'}
                  </Text>
                </TouchableOpacity>
              )}
              <Text
                style={{
                  color: isDark ? '#98989F' : '#6B7280',
                  fontSize: 14,
                  marginTop: 4,
                  textAlign: 'center',
                }}
              >
                {user?.phone || 'CediSmart Member'}
              </Text>
            </View>

            <SettingsGroup style={{ marginTop: 12 }}>
              <SettingItem
                icon={ShieldCheck}
                title="Identity Verification"
                onPress={() => {
                  if (isKycVerified) {
                    Alert.alert(
                      'Identity Verified',
                      `Your account is linked to your Ghana Card (${ghanaCardNumber}) and verified for Tier 1 transaction limits.`
                    );
                  } else {
                    profileDetailSheetRef.current?.close();
                    setTimeout(() => kycSheetRef.current?.snapToIndex(0), 220);
                  }
                }}
                color={isKycVerified ? '#16a34a' : undefined}
              >
                <Text className={`font-bold text-base ${isKycVerified ? 'text-success' : isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                  {isKycVerified ? 'Verified (Tier 1)' : 'Unverified (Tap to verify)'}
                </Text>
              </SettingItem>

              <SettingItem
                icon={Award}
                title="Membership & Plan"
                onPress={() => {
                  if (user?.is_premium) {
                    Alert.alert(
                      'CediSmart Pro',
                      'You are a Pro member! Enjoy unlimited vaults, CSV exports, and priority offline syncing.',
                      [{ text: 'Great!' }]
                    );
                  } else if (effectiveTrialActive) {
                    Alert.alert(
                      'Free Trial Active',
                      `You are currently enjoying CediSmart Pro for free! You have ${effectiveTrialDays} ${effectiveTrialDays === 1 ? 'day' : 'days'} left. Would you like to subscribe to a paid plan now to avoid interruption?`,
                      [
                        { text: 'Later', style: 'cancel' },
                        {
                          text: 'View Plans',
                          onPress: () => {
                            profileDetailSheetRef.current?.close();
                            setTimeout(() => pricingSheetRef.current?.snapToIndex(0), 220);
                          },
                        },
                      ]
                    );
                  } else if (!user?.trial_started_at) {
                    Alert.alert(
                      'Start Free Trial',
                      'Activate your 7-day free trial of CediSmart Pro now to enjoy automatic syncing and unlimited features.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Start Trial Now', onPress: handleStartTrial },
                      ]
                    );
                  } else {
                    profileDetailSheetRef.current?.close();
                    setTimeout(() => pricingSheetRef.current?.snapToIndex(0), 220);
                  }
                }}
                color={user?.is_premium || effectiveTrialActive ? '#4c56af' : undefined}
                isLast
              >
                <Text className={`font-bold text-base ${(user?.is_premium || effectiveTrialActive) ? (isDark ? 'text-indigo-400' : 'text-secondary') : isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                  {user?.is_premium
                    ? 'CediSmart Pro'
                    : effectiveTrialActive
                    ? `Free Trial (${effectiveTrialDays} ${effectiveTrialDays === 1 ? 'day' : 'days'} left)`
                    : !user?.trial_started_at
                    ? 'Free Tier (Redeem Trial)'
                    : 'Free Tier (Tap to upgrade)'}
                </Text>
              </SettingItem>
            </SettingsGroup>

            {/* Conditional Cancel Option inside Profile Details */}
            {(user?.is_premium || effectiveTrialActive) && (
              <TouchableOpacity
                onPress={handleCancelPlan}
                disabled={isCancellingPlan}
                className="mt-1 py-3 px-4 rounded-xl border border-red-500/20 bg-red-500/5 items-center justify-center flex-row active:scale-95"
              >
                {isCancellingPlan ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <Text className="text-red-500 font-bold text-sm">
                    {user?.is_premium ? 'Cancel Paid Subscription' : 'Opt-out of Free Trial'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Interactive Guide Detail Bottom Sheet */}
      <BottomSheet
        ref={guideSheetRef}
        index={-1}
        snapPoints={['76%', '92%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundComponent={GlassSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}>
          {(() => {
            const guidesMap = {
              sms: {
                title: 'SMS Auto-Sync',
                subtitle: 'Zero-friction transaction tracking for MTN MoMo, Telecel Cash, AT Money & Ghanaian banks.',
                color: '#10b981',
                icon: Sparkles,
                hash: '#sms-auto-sync',
                ctaLabel: 'Try SMS Import',
                onCta: () => {
                  guideSheetRef.current?.close();
                  setTimeout(() => navigation.navigate('AddTransaction'), 200);
                },
                steps: [
                  {
                    badge: '1',
                    heading: 'Android Background Auto-Detection',
                    body: 'On Android, CediSmart automatically detects incoming MoMo and bank SMS alerts and surfaces a 1-tap "Log Now" card right on your Home Dashboard.',
                  },
                  {
                    badge: '2',
                    heading: 'iPhone Paste-to-Log & Shortcuts',
                    body: 'On iPhone, copy any MoMo or bank SMS alert, tap + Add Transaction, and select "Import MoMo SMS Alert"—or configure an iOS Shortcuts Automation to open CediSmart whenever a MobileMoney SMS arrives.',
                  },
                  {
                    badge: '3',
                    heading: 'AI Merchant, Fee & Category Parsing',
                    body: 'CediSmart AI automatically extracts the exact amount, transaction direction (income vs. expense), merchant/reference, and maps it to the right wallet and category.',
                  },
                ],
              },
              budgets: {
                title: 'Smart Budgets',
                subtitle: 'Stay ahead of monthly category limits and know your exact daily spending allowance.',
                color: '#4c56af',
                icon: PieChart,
                hash: '#budgets',
                ctaLabel: 'Open Budgets',
                onCta: () => {
                  guideSheetRef.current?.close();
                  setTimeout(() => navigation.navigate('BudgetsTab'), 200);
                },
                steps: [
                  {
                    badge: '1',
                    heading: 'Safe-to-Spend Today',
                    body: 'Calculated live on your Home Dashboard as (Total Monthly Budget − Spent So Far) ÷ Remaining Days in Month, giving you a clear daily target in GH₵.',
                  },
                  {
                    badge: '2',
                    heading: '50/30/20 AI Budget Generator',
                    body: 'In the Budgets tab, use the AI generator to automatically split your monthly income across 50% Needs, 30% Wants, and 20% Savings & Debt.',
                  },
                  {
                    badge: '3',
                    heading: 'Proactive Threshold Alerts',
                    body: 'Customize your warning threshold (50%–100% under Settings → Notifications) to get notified before you overspend any category.',
                  },
                ],
              },
              gestures: {
                title: 'Voice & Gestures',
                subtitle: 'Navigate at 120fps with Apple-style swipe gestures, hands-free voice AI, and offline resilience.',
                color: isDark ? '#4ade80' : '#0d631b',
                icon: Smartphone,
                hash: '#voice-ai',
                ctaLabel: 'Open AI Assistant',
                onCta: () => {
                  guideSheetRef.current?.close();
                  setTimeout(() => setIsSupportModalVisible(true), 220);
                },
                steps: [
                  {
                    badge: '1',
                    heading: 'Apple-Style Swipe Gestures',
                    body: 'On any transaction card, short-swipe left to reveal Categorize & Delete actions, or full-swipe left all the way across the row to delete immediately.',
                  },
                  {
                    badge: '2',
                    heading: 'Hands-Free Voice AI (English, Pidgin & Twi)',
                    body: 'Tap the Headphones icon on the Home Dashboard to speak naturally ("Log 50 cedis for fuel on MoMo" or "How is my food budget doing?") in English, Pidgin, or Twi.',
                  },
                  {
                    badge: '3',
                    heading: '100% Offline-First Logging',
                    body: 'Log transactions anytime without mobile data. Items are saved securely to your local Offline Queue and sync automatically as soon as connectivity returns.',
                  },
                ],
              },
              profiles: {
                title: 'Multi-Profile & KYC',
                subtitle: 'Separate personal and side-hustle finances on one device and unlock Tier 1 verification.',
                color: '#d97706',
                icon: Users,
                hash: '#profiles',
                ctaLabel: 'Switch Profile',
                onCta: () => {
                  guideSheetRef.current?.close();
                  setTimeout(() => switchSheetRef.current?.snapToIndex(0), 220);
                },
                steps: [
                  {
                    badge: '1',
                    heading: 'Multi-Profile Switching',
                    body: 'Tap "Switch Profile" inside the Profile card at the top of Settings to add a second account (e.g., your Business or Side-Hustle line) and switch with FaceID or PIN.',
                  },
                  {
                    badge: '2',
                    heading: 'Isolated Wallets, Budgets & Statements',
                    body: 'Each profile keeps its own separate MoMo wallets, bank accounts, budgets, and branded PDF monthly statements.',
                  },
                  {
                    badge: '3',
                    heading: 'Ghana Card (Tier 1) KYC Verification',
                    body: 'Open Profile → Identity Verification and enter your Ghana Card number (GHA-XXXXXXXXX-X) to unlock Tier 1 verified status.',
                  },
                ],
              },
            };

            const activeGuide = guidesMap[selectedGuideId];
            const GuideIcon = activeGuide.icon;

            return (
              <View className="px-6 py-4">
                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 12 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: `${activeGuide.color}20`,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <GuideIcon size={20} color={activeGuide.color} />
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        color: isDark ? '#ffffff' : '#111827',
                        fontSize: 19,
                        fontWeight: '700',
                        letterSpacing: -0.3,
                      }}
                      numberOfLines={2}
                    >
                      {activeGuide.title}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => guideSheetRef.current?.close()}>
                    <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold text-base`}>Done</Text>
                  </TouchableOpacity>
                </View>

                <Text
                  style={{
                    color: isDark ? '#98989F' : '#6B7280',
                    fontSize: 13.5,
                    lineHeight: 19,
                    marginBottom: 18,
                  }}
                >
                  {activeGuide.subtitle}
                </Text>

                {/* Step-by-Step Cards */}
                {activeGuide.steps.map((step) => (
                  <View
                    key={step.badge}
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(164, 243, 185, 0.14)' : 'rgba(0, 0, 0, 0.07)',
                      backgroundColor: isDark ? 'rgba(20, 30, 24, 0.88)' : '#ffffff',
                      padding: 16,
                      marginBottom: 12,
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: `${activeGuide.color}22`,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                        marginTop: 1,
                      }}
                    >
                      <Text style={{ color: activeGuide.color, fontWeight: '800', fontSize: 13 }}>{step.badge}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: isDark ? '#ffffff' : '#111827',
                          fontSize: 15,
                          fontWeight: '700',
                          marginBottom: 4,
                        }}
                      >
                        {step.heading}
                      </Text>
                      <Text
                        style={{
                          color: isDark ? '#98989F' : '#6B7280',
                          fontSize: 13.5,
                          lineHeight: 19,
                        }}
                      >
                        {step.body}
                      </Text>
                    </View>
                  </View>
                ))}

                {/* Primary In-App Quick Action Button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={activeGuide.onCta}
                  className="w-full py-4 px-5 rounded-2xl bg-primary items-center justify-center flex-row shadow-lg shadow-primary/25 mt-2"
                >
                  <Text className="text-white font-bold text-base mr-2">{activeGuide.ctaLabel}</Text>
                  <ChevronRight size={18} color="#ffffff" />
                </TouchableOpacity>
              </View>
            );
          })()}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Full-screen Profile Photo Viewer */}
      <Modal
        visible={isViewingProfilePhoto}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsViewingProfilePhoto(false)}
      >
        <View className="flex-1 bg-black justify-center items-center relative">
          <TouchableOpacity
            onPress={() => setIsViewingProfilePhoto(false)}
            className="absolute top-14 right-6 p-3 bg-white/10 rounded-full active:scale-90"
          >
            <Text className="text-white font-headline font-bold text-sm">Close</Text>
          </TouchableOpacity>
          <Image
            source={{ uri: userAvatarUri }}
            className="w-[90%] aspect-square rounded-2xl"
            resizeMode="contain"
          />
        </View>
      </Modal>

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

export default SettingsScreen;
