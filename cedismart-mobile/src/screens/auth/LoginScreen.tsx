import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Edit2, Shield, Trash2, HelpCircle } from 'lucide-react-native';
import PINPad from '../../components/shared/PINPad';
import apiClient, { setActiveTokens } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { CoinBackground } from '../../components/shared/CoinBackground';
import { SupportModal } from '../../components/shared/SupportModal';

const normalizePhoneNumber = (phone: string): string => {
  if (!phone) return '';
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.startsWith('+233')) return clean;
  if (clean.startsWith('233')) return `+${clean}`;
  if (clean.startsWith('0')) return `+233${clean.substring(1)}`;
  return `+233${clean}`;
};

const LoginScreen = ({ navigation }: any) => {
  const { login, savedAccounts, loadSavedAccounts, removeSavedAccount } = useAuthStore();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  
  const [step, setStep] = useState<'phone' | 'pin' | 'profile_picker'>('phone');
  const [supportVisible, setSupportVisible] = useState(false);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const shakeAnimation = useState(new Animated.Value(0))[0];

  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'fingerprint' | 'face' | null>(null);
  const [savedPhone, setSavedPhone] = useState('');
  const [savedPin, setSavedPin] = useState('');
  const [accountAvatars, setAccountAvatars] = useState<Record<string, string>>({});

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleBiometricAuth = async (phoneToUse: string, pinToUse: string) => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Log in with FaceID / Fingerprint',
        fallbackLabel: 'Use PIN',
      });
      if (result.success) {
        const normalized = normalizePhoneNumber(phoneToUse);
        loginMutation.mutate({ phone: normalized, pin: pinToUse });
      }
    } catch (e) {
      console.warn('Biometric auth error:', e);
    }
  };

  useEffect(() => {
    (async () => {
      // 1. Load saved profiles list from store
      await loadSavedAccounts();

      // Load avatar URIs for saved accounts
      const listStr2 = await AsyncStorage.getItem('saved_accounts_list');
      const savedList2 = listStr2 ? JSON.parse(listStr2) : [];
      const avatarMap: Record<string, string> = {};
      for (const acc of savedList2) {
        if (acc.id) {
          const uri = await AsyncStorage.getItem(`user_avatar_${acc.id}`);
          if (uri) avatarMap[acc.phone] = uri;
        }
      }
      setAccountAvatars(avatarMap);
      
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      const listStr = await AsyncStorage.getItem('saved_accounts_list');
      const savedList = listStr ? JSON.parse(listStr) : [];
      
      const lastPhone = await AsyncStorage.getItem('last_logged_in_phone');
      const suppressAutoBio = await AsyncStorage.getItem('suppress_auto_bio');
      if (suppressAutoBio === 'true') {
        await AsyncStorage.removeItem('suppress_auto_bio');
      }

      if (savedList && savedList.length > 0) {
        // Default to profile picker step!
        setStep('profile_picker');
        
        // If there's only ONE saved account, we go straight to 'pin' step, and auto-trigger biometrics!
        if (savedList.length === 1) {
          const singleAccount = savedList[0];
          const normalizedSingle = normalizePhoneNumber(singleAccount.phone);
          setPhone(normalizedSingle.replace('+233', '').replace(/^0/, ''));
          setStep('pin');
          
          if (hasHardware && isEnrolled) {
            const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
            if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
              setBiometricType('face');
            } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
              setBiometricType('fingerprint');
            }

            const phoneVal = await SecureStore.getItemAsync('biometric_phone');
            if (phoneVal && normalizePhoneNumber(phoneVal) === normalizedSingle) {
              const sanitizedPhone = normalizedSingle.replace(/[^\w.-]/g, '');
              const pinKey = `user_pin_${sanitizedPhone}`;
              const pinVal = await SecureStore.getItemAsync(pinKey);
              if (pinVal) {
                setIsBiometricAvailable(true);
                setSavedPhone(normalizedSingle);
                setSavedPin(pinVal);
                if (suppressAutoBio !== 'true') {
                  setTimeout(() => {
                    handleBiometricAuth(normalizedSingle, pinVal);
                  }, 500);
                }
              }
            }
          }
        } else if (lastPhone && hasHardware && isEnrolled) {
          // If there are multiple accounts, check biometric settings for the last logged-in account
          const normalizedLast = normalizePhoneNumber(lastPhone);
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricType('face');
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometricType('fingerprint');
          }

          const phoneVal = await SecureStore.getItemAsync('biometric_phone');
          if (phoneVal && normalizePhoneNumber(phoneVal) === normalizedLast) {
            const sanitizedPhone = normalizedLast.replace(/[^\w.-]/g, '');
            const pinKey = `user_pin_${sanitizedPhone}`;
            const pinVal = await SecureStore.getItemAsync(pinKey);
            if (pinVal) {
              setIsBiometricAvailable(true);
              setSavedPhone(normalizedLast);
              setSavedPin(pinVal);
            }
          }
        }
      } else if (lastPhone) {
        const normalizedLast = normalizePhoneNumber(lastPhone);
        setPhone(normalizedLast.replace('+233', '').replace(/^0/, ''));
        setStep('pin');
        
        if (hasHardware && isEnrolled) {
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricType('face');
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometricType('fingerprint');
          }

          const phoneVal = await SecureStore.getItemAsync('biometric_phone');
          if (phoneVal && normalizePhoneNumber(phoneVal) === normalizedLast) {
            const sanitizedPhone = normalizedLast.replace(/[^\w.-]/g, '');
            const pinKey = `user_pin_${sanitizedPhone}`;
            const pinVal = await SecureStore.getItemAsync(pinKey);
            if (pinVal) {
              setIsBiometricAvailable(true);
              setSavedPhone(normalizedLast);
              setSavedPin(pinVal);
              
              if (suppressAutoBio !== 'true') {
                setTimeout(() => {
                  handleBiometricAuth(normalizedLast, pinVal);
                }, 500);
              }
            }
          }
        }
      }
    })();
  }, []);

  const handlePress = (digit: string) => {
    setError('');
    if (step === 'phone') {
      if (phone.length < 9) {
        const newPhone = phone + digit;
        setPhone(newPhone);
        if (newPhone.length === 9) {
          setTimeout(() => setStep('pin'), 150);
        }
      }
    } else {
      if (pin.length < 6) {
        const newPin = pin + digit;
        setPin(newPin);
        if (newPin.length === 6) {
          loginMutation.mutate({ phone: `+233${phone}`, pin: newPin });
        }
      }
    }
  };

  const handleBackspace = () => {
    setError('');
    if (step === 'pin') {
      if (pin.length > 0) {
        setPin(pin.slice(0, -1));
      } else {
        setStep('phone');
      }
    } else {
      setPhone(phone.slice(0, -1));
    }
  };

  const loginMutation = useMutation({
    mutationFn: (data: { phone: string, pin: string }) => {
      console.log('[Login API] Logging in for phone:', data.phone);
      console.log('[Login API] BASE_URL:', process.env.EXPO_PUBLIC_API_URL);
      return apiClient.post('/auth/login', data);
    },
    onSuccess: async (response, variables) => {
      console.log('[Login API] Login success:', response.data);
      const { access_token, refresh_token, user } = response.data;
      
      // Store session tokens using the active session helper
      await setActiveTokens(user.phone || variables.phone, access_token, refresh_token);
      
      // Save PIN in SecureStore for biometric convenience
      const sanitizedPhone = (user.phone || variables.phone).replace(/[^\w.-]/g, '');
      await SecureStore.setItemAsync(`user_pin_${sanitizedPhone}`, variables.pin);
      
      // Trigger local login to hydrate state
      login(user);
    },
    onError: (err: any) => {
      console.error('[Login API] Error status:', err?.response?.status);
      console.error('[Login API] Error response:', err?.response?.data || err);
      console.error('[Login API] Requested URL:', err?.config?.baseURL + err?.config?.url);
      const serverError = err?.response?.data?.error;
      const errorMsg = typeof serverError === 'string' 
        ? serverError 
        : serverError?.message || 'Invalid credentials.';
      setError(errorMsg);
      setPin('');
      shake();
    }
  });

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-background'}`}>
      <CoinBackground />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6" showsVerticalScrollIndicator={false}>
          <View className="flex-1 justify-center py-8">
            <Animated.View 
              style={{ transform: [{ translateX: shakeAnimation }] }}
              className="items-center w-full"
            >
              {/* Branding Header */}
              <View className="items-center mb-10">
                <Text className="font-label text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Welcome Back</Text>
                <Text className={`font-headline text-3xl font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} tracking-tight text-center`}>
                  {step === 'profile_picker' ? 'Select Account' : step === 'phone' ? 'Enter Phone Number' : 'Enter Secure PIN'}
                </Text>
              </View>

              {step === 'profile_picker' ? (
                /* STEP 0: PROFILE PICKER */
                <View className="w-full mb-6">
                  <Text className={`font-label text-center text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-6`}>
                    Saved Accounts
                  </Text>
                  
                  <View className="w-full space-y-3 mb-6">
                    {savedAccounts.map((acc) => {
                      const initials = (acc.full_name || '')
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2);
                      const formattedPhone = `+233 ${acc.phone.slice(4, 6)} ••• ••${acc.phone.slice(-2)}`;

                      return (
                        <View 
                          key={acc.phone} 
                          className={`flex-row items-center justify-between w-full p-4 rounded-2xl border mb-3 ${
                            isDark 
                              ? 'bg-[#121613] border-dark-outline-variant/10' 
                              : 'bg-white border-outline-variant/5'
                          } shadow-sm`}
                        >
                          <TouchableOpacity
                            onPress={() => {
                              const normalized = normalizePhoneNumber(acc.phone);
                              setPhone(normalized.replace('+233', '').replace(/^0/, ''));
                              setStep('pin');
                              
                              // Check and pre-configure biometrics for this selected account
                              (async () => {
                                const hasHardware = await LocalAuthentication.hasHardwareAsync();
                                const isEnrolled = await LocalAuthentication.isEnrolledAsync();
                                if (hasHardware && isEnrolled) {
                                  const phoneVal = await SecureStore.getItemAsync('biometric_phone');
                                  if (phoneVal && normalizePhoneNumber(phoneVal) === normalized) {
                                    const sanitized = normalized.replace(/[^\w.-]/g, '');
                                    const pinVal = await SecureStore.getItemAsync(`user_pin_${sanitized}`);
                                    if (pinVal) {
                                      setIsBiometricAvailable(true);
                                      setSavedPhone(normalized);
                                      setSavedPin(pinVal);
                                      setTimeout(() => {
                                        handleBiometricAuth(normalized, pinVal);
                                      }, 300);
                                    }
                                  } else {
                                    setIsBiometricAvailable(false);
                                  }
                                }
                              })();
                            }}
                            className="flex-1 flex-row items-center mr-4"
                          >
                            <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center mr-4 overflow-hidden">
                              {accountAvatars[acc.phone] ? (
                                <Image 
                                  source={{ uri: accountAvatars[acc.phone] }} 
                                  style={{ width: '100%', height: '100%' }}
                                  resizeMode="cover"
                                />
                              ) : (
                                <Text className="text-primary font-headline font-bold text-base">{initials || 'CS'}</Text>
                              )}
                            </View>
                            <View className="flex-1">
                              <Text className={`font-headline font-bold text-base ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
                                {acc.full_name || 'CediSmart User'}
                              </Text>
                              <Text className={`font-body text-xs ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mt-1`}>
                                {formattedPhone}
                              </Text>
                            </View>
                          </TouchableOpacity>

                          {/* Delete profile shortcut */}
                          <TouchableOpacity
                            onPress={() => removeSavedAccount(acc.phone)}
                            className={`p-2.5 rounded-full ${isDark ? 'bg-[#181e19]' : 'bg-gray-50'} active:opacity-75`}
                          >
                            <Trash2 size={16} color="#BA1A1A" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      setStep('phone');
                      setPhone('');
                      setPin('');
                    }}
                    className={`w-full py-4 items-center justify-center rounded-2xl border border-dashed ${
                      isDark ? 'border-dark-outline-variant/30' : 'border-outline-variant/30'
                    } active:opacity-75`}
                  >
                    <Text className={`font-headline font-bold text-sm ${isDark ? 'text-[#2e7d32]' : 'text-primary'}`}>
                      + Add Another Account
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : step === 'phone' ? (
                /* STEP 1: PHONE INPUT */
                <View className={`w-full ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-lowest'} rounded-3xl p-6 shadow-sm border ${isDark ? 'border-dark-outline-variant/10' : 'border-outline-variant/5'} mb-8`}>
                  <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mb-3`}>Phone Number</Text>
                  <View className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} rounded-2xl overflow-hidden h-14 border ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}>
                    <View className={`flex-row items-center px-4 ${isDark ? 'bg-dark-surface-container-lowest' : 'bg-surface-container-high'} h-full border-r ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}>
                      <Image 
                        source={{ uri: 'https://flagsapi.com/GH/flat/64.png' }} 
                        className="w-6 h-4 rounded-sm mr-2"
                      />
                      <Text className={`font-body font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>+233</Text>
                    </View>
                    <View className="flex-1 justify-center px-4">
                      <Text className={`font-body text-lg tracking-widest ${phone ? `${isDark ? 'text-dark-on-surface' : 'text-on-surface'} font-semibold` : isDark ? 'text-gray-600' : 'text-gray-300'}`}>
                        {phone || 'XXXXXXXXX'}
                      </Text>
                    </View>
                  </View>
                  <Text className={`font-body text-[10px] ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} mt-3 leading-relaxed`}>
                    Type your registered 9-digit mobile number using the keypad below.
                  </Text>
                </View>
              ) : (
                /* STEP 2: PIN INPUT */
                <View className="w-full items-center mb-8">
                  {/* Phone Badge/Tag */}
                  <TouchableOpacity 
                    onPress={() => {
                      if (savedAccounts.length > 0) {
                        setStep('profile_picker');
                      } else {
                        setStep('phone');
                      }
                      setPin('');
                    }}
                    className={`flex-row items-center ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} px-5 py-2.5 rounded-full mb-6 border ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'} ${isDark ? 'active:bg-dark-surface-container-lowest' : 'active:bg-surface-container-high'} transition-all`}
                  >
                    <Text className={`${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} font-bold text-xs mr-2`}>
                      +233 {phone.slice(0, 2)} {phone.slice(2, 5)} {phone.slice(5)}
                    </Text>
                    <Edit2 size={12} color={isDark ? '#e1e3e0' : '#40493d'} />
                  </TouchableOpacity>

                  <View className="flex-row justify-center space-x-4 mb-4">
                    {[...Array(6)].map((_, i) => (
                      <View
                        key={i}
                        className={`w-4 h-4 rounded-full border-2 border-primary ${i < pin.length ? 'bg-primary' : 'bg-transparent'}`}
                      />
                    ))}
                  </View>

                  <TouchableOpacity 
                    onPress={() => {
                      setPin('');
                      setError('');
                      navigation.navigate('ForgotPIN');
                    }}
                    className="mt-2"
                  >
                    <Text className="font-body text-xs font-bold text-primary underline">
                      Forgot PIN?
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {error ? (
                <Text className="text-error text-sm font-semibold mb-4 text-center">{error}</Text>
              ) : null}
            </Animated.View>

            {step !== 'profile_picker' && (
              <PINPad 
                onPress={handlePress} 
                onBackspace={handleBackspace} 
                onBiometricPress={isBiometricAvailable && step === 'pin' ? () => handleBiometricAuth(savedPhone, savedPin) : undefined}
                biometricType={biometricType}
                disabled={loginMutation.isPending}
              />
            )}

            <View className="mt-8 flex-row justify-center items-center">
              <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'} font-body text-sm`}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text className={`${isDark ? 'text-[#2e7d32]' : 'text-primary'} font-bold font-body text-sm underline`}>Register</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-12 items-center opacity-40 flex-row justify-center space-x-2">
              <Shield size={12} color={isDark ? '#e1e3e0' : '#1c1b1f'} fill={isDark ? '#e1e3e0' : '#1c1b1f'} />
              <Text className={`font-label text-[9px] uppercase tracking-widest font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>End-to-End Encrypted</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* Support Action */}
      <View className="absolute bottom-10 right-8">
        <TouchableOpacity 
          onPress={() => setSupportVisible(true)}
          className={`flex-row items-center space-x-2 ${isDark ? 'bg-dark-surface-container-lowest/80' : 'bg-surface-container-lowest/80'} px-4 py-3 rounded-full shadow-lg border ${isDark ? 'border-dark-outline-variant/20' : 'border-outline-variant/10'}`}
        >
          <HelpCircle size={20} color={isDark ? '#2e7d32' : '#0d631b'} />
          <Text className={`font-label text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-[#2e7d32]' : 'text-primary'}`}>Support</Text>
        </TouchableOpacity>
      </View>

      <SupportModal
        visible={supportVisible}
        onClose={() => setSupportVisible(false)}
        phone={phone ? `+233${phone}` : undefined}
      />
    </SafeAreaView>
  );
};

export default LoginScreen;
