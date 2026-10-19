import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Animated, Dimensions, StatusBar, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';
import * as Haptics from 'expo-haptics';
import { Sun, Moon, Check, Sparkles } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassSurface } from '../../components/glass/GlassSurface';
import { GlassButton } from '../../components/glass/GlassButton';

const { width } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }: any) => {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';
  const [isTrialModalVisible, setIsTrialModalVisible] = useState(false);

  // Animation values
  const fadeAnimHeader = useRef(new Animated.Value(0)).current;
  const slideAnimHeader = useRef(new Animated.Value(30)).current;
  
  const fadeAnimImage = useRef(new Animated.Value(0)).current;
  const scaleAnimImage = useRef(new Animated.Value(0.9)).current;
  
  const fadeAnimButtons = useRef(new Animated.Value(0)).current;
  const slideAnimButtons = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    const checkRedirect = async () => {
      const redirect = await AsyncStorage.getItem('redirect_to_login');
      if (redirect === 'true') {
        await AsyncStorage.removeItem('redirect_to_login');
        navigation.replace('Login');
      }
    };
    checkRedirect();

    // Run sequential animations on mount
    Animated.stagger(250, [
      // 1. Fade & Slide in Header Text
      Animated.parallel([
        Animated.timing(fadeAnimHeader, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnimHeader, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        })
      ]),
      // 2. Fade & Scale in Illustration
      Animated.parallel([
        Animated.timing(fadeAnimImage, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnimImage, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        })
      ]),
      // 3. Fade & Slide in CTAs
      Animated.parallel([
        Animated.timing(fadeAnimButtons, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnimButtons, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        })
      ])
    ]).start();
  }, []);

  const handleGetStarted = () => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('Register');
  };

  const handleAcceptTrial = async () => {
    setIsTrialModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await AsyncStorage.setItem('pending_trial_opt_in', 'true');
    navigation.navigate('Register');
  };

  const handleDeclineTrial = async () => {
    setIsTrialModalVisible(false);
    Haptics.selectionAsync().catch(() => {});
    await AsyncStorage.removeItem('pending_trial_opt_in');
    navigation.navigate('Register');
  };

  const handleLogin = () => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('Login');
  };

  const handleThemeToggle = () => {
    Haptics.selectionAsync().catch(() => {});
    toggleTheme();
  };

  return (
    <View className={`flex-1 relative justify-between ${isDark ? 'bg-[#080a08]' : 'bg-[#f5f8f5]'}`}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Background Gradient Simulator (rich radial brand feel) */}
      <View className={`absolute inset-0 ${isDark ? 'bg-[#061208]' : 'bg-[#e8f5e9]'}`} />
      <View className={`absolute top-[-20%] left-[-20%] w-[140%] h-[100%] rounded-full ${isDark ? 'bg-primary/10' : 'bg-primary/5'} opacity-60 blur-3xl animate-pulse`} />

      <SafeAreaView className="flex-1">
        <View className="flex-1 justify-between px-8 py-6 relative">
          
          {/* Top Section with Theme Switcher & Header */}
          <View className="w-full mt-2">
            {/* Theme Toggle Icon Row */}
            <View className="w-full flex-row justify-end mb-4">
              <GlassButton
                onPress={handleThemeToggle}
                size={44}
                accessibilityLabel="Toggle theme"
              >
                {isDark ? (
                  <Sun size={20} color="#FBBF24" fill="#FBBF24" />
                ) : (
                  <Moon size={20} color="#475569" fill="#475569" />
                )}
              </GlassButton>
            </View>

            {/* Header Block */}
            <Animated.View 
              style={{ 
                opacity: fadeAnimHeader,
                transform: [{ translateY: slideAnimHeader }]
              }}
              className="items-center"
            >
              <Text className="text-4xl font-headline font-black text-primary tracking-tight mb-2">CediSmart</Text>
              <Text className={`text-base ${isDark ? 'text-gray-400' : 'text-gray-600'} font-body text-center leading-relaxed max-w-[290px]`}>
                Track daily spending, Mobile Money & monthly budgets in cedis.
              </Text>
            </Animated.View>
          </View>

          {/* Premium Illustration Panel */}
          <Animated.View
            style={{
              opacity: fadeAnimImage,
              transform: [{ scale: scaleAnimImage }]
            }}
            className="flex-1 justify-center items-center my-6"
          >
            <GlassSurface
              radius={42}
              elevated
              tint="emerald"
              style={{ width: '100%', maxWidth: 340, aspectRatio: 1, padding: 6 }}
            >
              <View className="flex-1 rounded-[36px] overflow-hidden">
                <Image 
                  source={require('../../../assets/welcome_illustration.jpg')}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              </View>
            </GlassSurface>
          </Animated.View>

          {/* Buttons Block */}
          <Animated.View
            style={{
              opacity: fadeAnimButtons,
              transform: [{ translateY: slideAnimButtons }]
            }}
            className="w-full items-center mb-6"
          >
            <TouchableOpacity
              onPress={handleGetStarted}
              className="w-full bg-primary h-14 rounded-2xl items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-all mb-4"
            >
              <Text className="text-white font-headline font-bold text-base">Get Started</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLogin}
              className="py-2.5 active:opacity-75"
            >
              <Text className={`${isDark ? 'text-gray-400' : 'text-gray-600'} font-headline font-medium text-sm`}>
                Already have an account? <Text className="text-primary font-bold">Login</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>

        </View>
      </SafeAreaView>

      {/* Trial Offer Modal */}
      <Modal
        visible={isTrialModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsTrialModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <GlassSurface
            variant="thick"
            elevated
            radius={32}
            style={{ width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
          >
            <View className="w-full p-6 pb-8">
              {/* Header */}
              <View className="items-center mb-6">
                <GlassSurface
                  tint="emerald"
                  radius={999}
                  style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}
                >
                  <Sparkles size={24} color={isDark ? '#4ade80' : '#16a34a'} />
                </GlassSurface>
                <Text className={`text-2xl font-headline font-bold text-center ${isDark ? 'text-white' : 'text-charcoal'}`}>
                  Unlock 7 Days Free
                </Text>
                <Text className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} text-center mt-1`}>
                  Try CediSmart Pro features with zero limitations.
                </Text>
              </View>

              {/* Feature List */}
              <View className="space-y-4 mb-8">
                <View className="flex-row items-start mb-3">
                  <View className="w-5 h-5 rounded-full bg-primary/20 items-center justify-center mr-3 mt-0.5">
                    <Check size={12} color={isDark ? '#4ade80' : '#16a34a'} />
                  </View>
                  <View className="flex-1">
                    <Text className={`font-headline font-bold text-sm ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                      Automated SMS Transaction Sync
                    </Text>
                    <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                      Auto-read Mobile Money transaction alerts from your SMS history.
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-start mb-3">
                  <View className="w-5 h-5 rounded-full bg-primary/20 items-center justify-center mr-3 mt-0.5">
                    <Check size={12} color={isDark ? '#4ade80' : '#16a34a'} />
                  </View>
                  <View className="flex-1">
                    <Text className={`font-headline font-bold text-sm ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                      Unlimited Ledgers & Vaults
                    </Text>
                    <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                      Link unlimited bank/MoMo wallets and manage custom vaults.
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-start">
                  <View className="w-5 h-5 rounded-full bg-primary/20 items-center justify-center mr-3 mt-0.5">
                    <Check size={12} color={isDark ? '#4ade80' : '#16a34a'} />
                  </View>
                  <View className="flex-1">
                    <Text className={`font-headline font-bold text-sm ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                      Beautiful CSV & PDF Exports
                    </Text>
                    <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                      Export all logs for tax compliance or business book-keeping.
                    </Text>
                  </View>
                </View>
              </View>

              {/* CTAs */}
              <View className="space-y-3">
                <TouchableOpacity
                  onPress={handleAcceptTrial}
                  className="w-full bg-primary h-14 rounded-2xl items-center justify-center shadow-lg shadow-primary/20 mb-2"
                >
                  <Text className="text-white font-headline font-bold text-base">
                    Start My 7-Day Free Trial
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDeclineTrial}
                  className="w-full h-12 items-center justify-center"
                >
                  <Text className={`font-headline font-semibold text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Decline Offer & Continue with Free Tier
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </GlassSurface>
        </View>
      </Modal>
    </View>
  );
};

export default WelcomeScreen;
