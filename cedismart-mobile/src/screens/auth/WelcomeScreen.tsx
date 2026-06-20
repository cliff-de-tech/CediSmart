import React, { useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, Animated, Dimensions, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';
import * as Haptics from 'expo-haptics';
import { Sun, Moon } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }: any) => {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

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
          <View className="w-full mt-4">
            {/* Theme Toggle Icon Row */}
            <View className="w-full flex-row justify-end mb-4">
              <TouchableOpacity
                onPress={handleThemeToggle}
                className={`w-11 h-11 rounded-full items-center justify-center border shadow-md active:scale-90 transition-all ${
                  isDark 
                    ? 'bg-[#121613] border-dark-outline-variant/20' 
                    : 'bg-white border-gray-200'
                }`}
              >
                {isDark ? (
                  <Sun size={20} color="#FBBF24" fill="#FBBF24" />
                ) : (
                  <Moon size={20} color="#475569" fill="#475569" />
                )}
              </TouchableOpacity>
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
              <Text className={`text-base ${isDark ? 'text-gray-400' : 'text-gray-600'} font-body text-center leading-relaxed max-w-[280px]`}>
                Master Your Finances, Grow Your Wealth.
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
            <View className={`w-full max-w-[340px] aspect-square rounded-[40px] overflow-hidden border shadow-2xl ${
              isDark 
                ? 'border-primary/20 shadow-primary/20 bg-[#0d1c10]' 
                : 'border-primary/10 shadow-primary/5 bg-[#e8f5e9]'
            }`}>
              <Image 
                source={require('../../../assets/welcome_illustration.jpg')}
                className="w-full h-full"
                resizeMode="cover"
              />
            </View>
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
    </View>
  );
};

export default WelcomeScreen;
