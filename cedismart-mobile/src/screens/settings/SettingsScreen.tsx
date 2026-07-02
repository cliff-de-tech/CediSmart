import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, Switch, Alert, TextInput, KeyboardAvoidingView, Platform, Modal, Image, ActivityIndicator, Dimensions } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useOfflineStore } from '../../stores/offlineStore';
import { useThemeStore } from '../../stores/themeStore';
import { User, Shield, Database, LogOut, Trash2, ChevronRight, Smartphone, Landmark, Award, SunMoon, Bell, ShieldCheck, Users, Plus, Wifi, WifiOff, RefreshCw, FileSpreadsheet, Info, X, Check, Bug, HelpCircle } from 'lucide-react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import NetInfo from '@react-native-community/netinfo';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import PINPad from '../../components/shared/PINPad';
import { formatGHS } from '../../utils/currency';
import apiClient, { setActiveTokens, clearActiveSession } from '../../api/client';
import { requestNotificationPermissions, triggerLocalNotification } from '../../utils/notifications';
import { SupportModal } from '../../components/shared/SupportModal';
import { CoinBackground } from '../../components/shared/CoinBackground';
let setAppIcon: any = null;
try {
  setAppIcon = require('@howincodes/expo-dynamic-app-icon').setAppIcon;
} catch (e) {
  // Gracefully catch import error if native module is not compiled in (e.g. in Expo Go sandbox)
}

const normalizePhoneNumber = (phone: string): string => {
  if (!phone) return '';
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.startsWith('+233')) return clean;
  if (clean.startsWith('233')) return `+${clean}`;
  if (clean.startsWith('0')) return `+233${clean.substring(1)}`;
  return `+233${clean}`;
};

const SettingItem = ({ icon: Icon, title, value, onPress, color, children, hideChevron }: any) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const iconColor = color || (isDark ? '#e1e3e0' : '#1C1C2E');
  return (
    <TouchableOpacity 
      onPress={onPress}
      disabled={!onPress}
      className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'} p-5 mb-2 rounded-2xl border shadow-sm`}
    >
      <View className={`w-10 h-10 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-gray-50'} items-center justify-center mr-4`}>
        <Icon size={20} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className={`${isDark ? 'text-gray-500' : 'text-gray-400'} text-[10px] font-bold uppercase tracking-wider mb-1`}>{title}</Text>
        {children || <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base`}>{value}</Text>}
      </View>
      {onPress && !hideChevron && <ChevronRight size={20} color={isDark ? '#4B5563' : '#D1D5DB'} />}
    </TouchableOpacity>
  );
};


const SettingsScreen = ({ navigation, route }: any) => {
  const { user, logout, updateUser, savedAccounts, loadSavedAccounts, removeSavedAccount, login } = useAuthStore();
  const { queue, clearQueue } = useOfflineStore();
  
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.full_name || '');

  // KYC States
  const kycSheetRef = useRef<BottomSheet>(null);
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
  const [currentAppIcon, setCurrentAppIcon] = useState('Luminous Emerald');
  const [isOnline, setIsOnline] = useState(true);
  const [appLockSetting, setAppLockSetting] = useState('never');
  const [budgetThreshold, setBudgetThreshold] = useState(0.8);

  // Bug reporting states
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const [isBugModalVisible, setIsBugModalVisible] = useState(false);
  const [isSupportModalVisible, setIsSupportModalVisible] = useState(false);


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
  const { theme, setTheme } = useThemeStore();
  const isDark = theme === 'dark';
  const isDarkMode = isDark;

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
      setIsBugModalVisible(false);
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

  const handleUpgrade = async () => {
    try {
      await apiClient.patch('/users/me', { is_premium: true });
      updateUser({ is_premium: true });
      Alert.alert('Success', 'Welcome to CediSmart Pro! Enjoy unlimited accounts, budgets, and exports.');
    } catch (error) {
      Alert.alert('Error', 'Failed to upgrade to Pro. Please try again.');
    }
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
    if (!user?.is_premium) {
      Alert.alert(
        'CediSmart Pro Feature',
        'Exporting transaction history is only available for Pro members. Upgrade now to get access!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: handleUpgrade }
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

  const handleSelectAppIcon = async (iconName: string) => {
    if (!user?.is_premium) {
      Alert.alert(
        'CediSmart Pro Feature',
        'Custom App Icons are only available for Pro members. Upgrade now to get access!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: handleUpgrade }
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
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-background'}`}>
      <CoinBackground />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1 px-6 py-8" showsVerticalScrollIndicator={false}>
          <Text className={`text-3xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-8`}>Settings</Text>

          {/* Profile Section */}
          <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-4 ml-1`}>Profile</Text>
          <SettingItem 
            icon={User} 
            title="Full Name" 
            onPress={() => setIsEditingName(true)}
          >
            {isEditingName ? (
              <TextInput 
                className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base py-1 border-b border-primary/20`}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                onBlur={saveName}
                onSubmitEditing={saveName}
                returnKeyType="done"
              />
            ) : (
              <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base`}>{user?.full_name || 'Set Name'}</Text>
            )}
          </SettingItem>
          <SettingItem icon={Smartphone} title="Phone Number" value={user?.phone} />
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
                kycSheetRef.current?.snapToIndex(0);
              }
            }}
            color={isKycVerified ? "#16a34a" : undefined}
          >
            <Text className={`font-bold text-base ${isKycVerified ? 'text-success' : isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
              {isKycVerified ? `Verified (Tier 1)` : 'Unverified (Tap to verify)'}
            </Text>
          </SettingItem>
          <SettingItem 
            icon={Landmark} 
            title="Link MoMo / Bank Account" 
            onPress={() => navigation.navigate('Accounts')} 
          >
            <Text className={`font-bold text-base ${isLinked ? 'text-success' : isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
              {isLinked ? 'LINKED' : 'Not Linked'}
            </Text>
          </SettingItem>
          <SettingItem 
            icon={Users} 
            title="Switch Account" 
            onPress={() => switchSheetRef.current?.snapToIndex(0)} 
          >
            <Text className={`font-bold text-base ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
              {savedAccounts.length > 1 ? `${savedAccounts.length} Accounts` : 'Manage'}
            </Text>
          </SettingItem>

          {/* Membership Section */}
          <View className="mt-6">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-4 ml-1`}>Membership</Text>
            <SettingItem 
              icon={Award} 
              title="Premium Level" 
              onPress={() => {
                if (user?.is_premium) {
                  Alert.alert(
                    'CediSmart Pro',
                    'You are a Pro member! Enjoy unlimited vaults, CSV exports, and priority offline syncing.',
                    [{ text: 'Great!' }]
                  );
                } else {
                  Alert.alert(
                    'Upgrade to Pro',
                    'Get unlimited vaults, CSV exports, and link unlimited bank/MoMo accounts for ₵10/month.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Upgrade Now', onPress: handleUpgrade }
                    ]
                  );
                }
              }}
              color={user?.is_premium ? "#4c56af" : undefined}
            >
              <Text className={`font-bold text-base ${user?.is_premium ? (isDark ? 'text-indigo-400' : 'text-secondary') : isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>
                {user?.is_premium ? 'CediSmart Pro' : 'Free Tier (Tap to upgrade)'}
              </Text>
            </SettingItem>
          </View>

          {/* Appearance Section */}
          <View className="mt-6">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-4 ml-1`}>Appearance</Text>
            <SettingItem 
              icon={SunMoon} 
              title="Dark Mode" 
            >
               <View className="flex-row justify-between items-center w-full">
                 <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base`}>Enable Dark Theme</Text>
                 <Switch 
                   value={isDarkMode} 
                   onValueChange={(val) => setTheme(val ? 'dark' : 'light')}
                   trackColor={{ false: theme === 'dark' ? '#374151' : '#D1D5DB', true: '#0d631b' }}
                 />
               </View>
            </SettingItem>
          </View>

          {/* Security Section */}
          <View className="mt-6">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-4 ml-1`}>Security</Text>
            <SettingItem 
              icon={Shield} 
              title="Biometric Login" 
              onPress={() => isBiometricSupported && handleBiometricToggle(!isBiometricEnabled)}
              hideChevron
            >
              <View className="flex-row justify-between items-center w-full">
                <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base`}>
                  {isBiometricSupported ? 'Use FaceID / Fingerprint' : 'Not supported'}
                </Text>
                {isBiometricSupported && (
                  <Switch 
                    value={isBiometricEnabled} 
                    onValueChange={handleBiometricToggle}
                    trackColor={{ false: theme === 'dark' ? '#374151' : '#D1D5DB', true: '#0d631b' }}
                  />
                )}
              </View>
            </SettingItem>
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
            />
          </View>

          {/* Notifications Section */}
          <View className="mt-6">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-4 ml-1`}>Notifications</Text>
            <SettingItem icon={Bell} title="SMS Alert Reminders">
               <View className="flex-row justify-between items-center w-full">
                 <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base`}>Weekly SMS summaries</Text>
                 <Switch 
                   value={smsAlerts} 
                   onValueChange={handleSmsAlertsToggle}
                   trackColor={{ false: theme === 'dark' ? '#374151' : '#D1D5DB', true: '#0d631b' }}
                 />
               </View>
            </SettingItem>
            <SettingItem icon={Bell} title="Budget Alert Notifications">
               <View className="flex-row justify-between items-center w-full">
                 <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base`}>Send notification at limit</Text>
                 <Switch 
                   value={budgetAlerts} 
                   onValueChange={handleBudgetAlertsToggle}
                   trackColor={{ false: theme === 'dark' ? '#374151' : '#D1D5DB', true: '#0d631b' }}
                 />
               </View>
            </SettingItem>
            {budgetAlerts && (
              <SettingItem 
                icon={Bell} 
                title="Budget Warning Threshold" 
                value={`${Math.round(budgetThreshold * 100)}% limit`} 
                onPress={handleBudgetThresholdChange}
              />
            )}
          </View>

          {/* Data Section */}
          <View className="mt-6">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-4 ml-1`}>Data & Storage</Text>
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
              icon={Smartphone} 
              title="Premium App Icon" 
              value={currentAppIcon}
              onPress={() => {
                if (user?.is_premium) {
                  appIconSheetRef.current?.snapToIndex(0);
                } else {
                  Alert.alert(
                    'CediSmart Pro Feature',
                    'Custom App Icons are a premium feature. Upgrade to Pro to customize your home screen!',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Upgrade to Pro', onPress: handleUpgrade }
                    ]
                  );
                }
              }}
              color={user?.is_premium ? "#4c56af" : undefined}
            />
          </View>

          {/* Support Section */}
          <View className="mt-6">
            <Text className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-widest mb-4 ml-1`}>Support</Text>
            <SettingItem 
              icon={Bug} 
              title="Report a Bug" 
              value="Submit issues to developers" 
              onPress={() => setIsBugModalVisible(true)}
            />
            <SettingItem 
              icon={HelpCircle} 
              title="AI Support Assistant" 
              value="Chat with CediSmart AI helper" 
              onPress={() => setIsSupportModalVisible(true)}
            />
          </View>

          {/* Danger Zone */}
          <View className="mt-10 mb-24">
            <TouchableOpacity 
              onPress={handleLogout}
              className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10' : 'bg-white border-gray-100'} p-5 mb-4 rounded-2xl border shadow-sm`}
            >
              <View className={`w-10 h-10 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-gray-50'} items-center justify-center mr-4`}>
                <LogOut size={20} color={isDark ? '#e1e3e0' : '#1C1C2E'} />
              </View>
              <Text className={`${isDark ? 'text-dark-charcoal' : 'text-charcoal'} font-bold text-base flex-1`}>Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleDeleteAccount}
              className={`flex-row items-center ${isDark ? 'bg-red-950/20 border-red-900/30' : 'bg-red-50 border-red-100'} p-5 rounded-2xl border`}
            >
              <View className={`w-10 h-10 rounded-full ${isDark ? 'bg-dark-surface-container-low' : 'bg-white'} items-center justify-center mr-4`}>
                <Trash2 size={20} color="#DC2626" />
              </View>
              <Text className="text-error font-bold text-base flex-1">Delete Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Report Bug Modal */}
      <Modal
        visible={isBugModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsBugModalVisible(false)}
      >
        <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-surface/95' : 'bg-white/95'}`}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 justify-center"
          >
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
              <View className={`w-full p-6 rounded-3xl ${isDark ? 'bg-dark-surface-container-low border border-dark-outline-variant/10' : 'bg-white shadow-xl border border-gray-100'}`}>
                {/* Header */}
                <View className="flex-row justify-between items-center mb-6">
                  <View className="flex-row items-center">
                    <View className={`w-10 h-10 rounded-full ${isDark ? 'bg-red-950/30' : 'bg-red-55'} items-center justify-center mr-3`}>
                      <Bug size={20} color="#DC2626" />
                    </View>
                    <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Report a Bug</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => setIsBugModalVisible(false)}
                    className={`w-8 h-8 rounded-full ${isDark ? 'bg-dark-surface-container-high' : 'bg-gray-100'} items-center justify-center`}
                  >
                    <X size={18} color={isDark ? '#e1e3e0' : '#4B5563'} />
                  </TouchableOpacity>
                </View>

                {/* Subtitle */}
                <Text className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Help us improve CediSmart. Describe the issue in detail, and our support team will instantly track, escalate, and resolve it to keep your experience flawless.
                </Text>

                {/* Bug Title */}
                <Text className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Bug Title</Text>
                <TextInput
                  value={bugTitle}
                  onChangeText={setBugTitle}
                  placeholder="e.g. App crashes on PIN creation"
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  className={`w-full p-4 mb-4 rounded-xl border ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20 text-white' : 'bg-gray-50 border-gray-200 text-charcoal'} font-medium`}
                />

                {/* Bug Description */}
                <Text className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Description</Text>
                <TextInput
                  value={bugDescription}
                  onChangeText={setBugDescription}
                  placeholder="Please describe what happened, steps to reproduce, and any error message you saw..."
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  className={`w-full p-4 mb-6 rounded-xl border h-36 ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20 text-white' : 'bg-gray-50 border-gray-200 text-charcoal'} font-medium`}
                />

                {/* Submit Button */}
                <TouchableOpacity
                  onPress={handleReportBug}
                  disabled={isSubmittingBug}
                  className={`w-full py-4 rounded-xl flex-row justify-center items-center ${isSubmittingBug ? 'bg-gray-400' : 'bg-primary'}`}
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
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Change PIN Bottom Sheet */}
      <BottomSheet
        ref={pinSheetRef}
        index={-1}
        snapPoints={['75%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        onClose={resetPinForm}
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 py-4 items-center">
            <View className="w-full flex-row justify-between items-center mb-8">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Change PIN</Text>
              <TouchableOpacity onPress={() => pinSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Cancel</Text>
              </TouchableOpacity>
            </View>

            <View className="items-center w-full mb-8">
              {/* Step indicator/header */}
              <Text className={`text-sm font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wider mb-4`}>
                {pinStep === 1 ? 'Enter Current PIN' : pinStep === 2 ? 'Enter New PIN' : 'Confirm New PIN'}
              </Text>

              {/* Dots */}
              <View className="flex-row justify-center space-x-4 mb-4">
                {[...Array(6)].map((_, i) => {
                  let filled = false;
                  if (pinStep === 1) filled = i < currentPin.length;
                  else if (pinStep === 2) filled = i < newPin.length;
                  else filled = i < confirmPin.length;
                  
                  return (
                    <View
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 border-primary ${filled ? 'bg-primary' : 'bg-transparent'}`}
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
        snapPoints={['75%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        onClose={() => {
          setCardNum('');
          setFullNameKyc('');
          setDobKyc('');
          setKycError('');
        }}
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 py-4">
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Verify Identity</Text>
              <TouchableOpacity onPress={() => kycSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Cancel</Text>
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
                  className={`${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 text-dark-charcoal' : 'bg-white border-gray-100 text-charcoal'} px-4 py-4 rounded-xl border text-base shadow-sm`}
                  placeholder="GHA-123456789-0"
                  placeholderTextColor={theme === 'dark' ? '#4b5563' : '#D1D5DB'}
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
                  className={`${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 text-dark-charcoal' : 'bg-white border-gray-100 text-charcoal'} px-4 py-4 rounded-xl border text-base shadow-sm`}
                  placeholder="e.g. Kofi Mensah"
                  placeholderTextColor={theme === 'dark' ? '#4b5563' : '#D1D5DB'}
                  value={fullNameKyc}
                  onChangeText={setFullNameKyc}
                  editable={!isVerifying}
                />
              </View>

              <View>
                <Text className={`text-xs font-semibold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-2 ml-1`}>Date of Birth</Text>
                <TextInput
                  className={`${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/10 text-dark-charcoal' : 'bg-white border-gray-100 text-charcoal'} px-4 py-4 rounded-xl border text-base shadow-sm`}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme === 'dark' ? '#4b5563' : '#D1D5DB'}
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
        snapPoints={['75%', '100%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        onClose={() => {
          setBiometricPin('');
          setBiometricPinError('');
        }}
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 py-4 items-center">
            <View className="w-full flex-row justify-between items-center mb-8">
              <Text className={`text-2xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Enable Biometrics</Text>
              <TouchableOpacity onPress={() => biometricPinSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Cancel</Text>
              </TouchableOpacity>
            </View>

            <View className="items-center w-full mb-8">
              <Text className={`text-sm font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wider mb-4`}>
                Enter Security PIN to Confirm
              </Text>

              {/* Dots */}
              <View className="flex-row justify-center space-x-4 mb-4">
                {[...Array(6)].map((_, i) => (
                  <View
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 border-primary ${i < biometricPin.length ? 'bg-primary' : 'bg-transparent'}`}
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
        snapPoints={['50%', '80%']}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 py-4">
            <View className="w-full flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Switch Profile</Text>
              <TouchableOpacity onPress={() => switchSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Close</Text>
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
                isDark ? 'border-primary/40 bg-[#1f2920]' : 'border-primary/30 bg-primary/5'
              } rounded-2xl items-center justify-center mb-6 flex-row space-x-2`}
            >
              <Plus size={18} color={isDark ? '#4ade80' : '#16a34a'} />
              <Text className={`font-headline font-bold text-sm ${isDark ? 'text-primary' : 'text-primary'}`}>
                Add Another Account
              </Text>
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
          </View>
        </View>
      </Modal>

      {/* Offline Queue Bottom Sheet */}
      <BottomSheet
        ref={offlineQueueSheetRef}
        index={-1}
        snapPoints={['50%', '90%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 py-4">
            <View className="w-full flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Offline Queue</Text>
              <TouchableOpacity onPress={() => offlineQueueSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Close</Text>
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
        snapPoints={['50%']}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 32 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-6 py-4">
            <View className="w-full flex-row justify-between items-center mb-6">
              <Text className={`text-2xl font-headline font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`}>Premium App Icon</Text>
              <TouchableOpacity onPress={() => appIconSheetRef.current?.close()}>
                <Text className="text-primary font-bold">Close</Text>
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

      <SupportModal
        visible={isSupportModalVisible}
        onClose={() => setIsSupportModalVisible(false)}
        phone={user?.phone}
        userName={user?.full_name}
      />
    </SafeAreaView>
  );

};

export default SettingsScreen;
