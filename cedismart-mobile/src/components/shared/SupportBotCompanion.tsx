import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Bot, Sparkles, X } from 'lucide-react-native';
import { GlassSurface } from '../glass/GlassSurface';
import { useThemeStore } from '../../stores/themeStore';

export interface SupportBotCompanionProps {
  userName?: string;
  screenContext?: 'dashboard' | 'budgets' | 'transactions' | 'settings' | 'auth';
  onOpenSupport: () => void;
  bottomOffset?: number;
}

export const SupportBotCompanion: React.FC<SupportBotCompanionProps> = ({
  userName,
  screenContext = 'dashboard',
  onOpenSupport,
  bottomOffset = 96,
}) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  // State: 'hidden' | 'greeting' | 'timeout_farewell' | 'dismissed_farewell' | 'minimized'
  const [stage, setStage] = useState<'hidden' | 'greeting' | 'timeout_farewell' | 'dismissed_farewell' | 'minimized'>('hidden');

  // Animations
  const animSlide = useRef(new Animated.Value(60)).current;
  const animOpacity = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.85)).current;
  const animBubblePulse = useRef(new Animated.Value(1)).current;

  // Extract clean first name
  const getFirstName = () => {
    if (!userName) return 'there';
    const clean = userName.trim();
    const parts = clean.split(' ');
    const titles = ['mr', 'mrs', 'ms', 'dr', 'prof', 'rev', 'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'rev.'];
    if (parts.length > 1 && titles.includes(parts[0].toLowerCase())) {
      return parts[1];
    }
    return parts[0];
  };

  const firstName = getFirstName();

  // Screen-specific greeting text
  const getGreetingMessage = () => {
    switch (screenContext) {
      case 'budgets':
        return `Hey ${firstName}! 👋 Need any help planning or tracking your budgets today?`;
      case 'transactions':
        return `Hey ${firstName}! 👋 Looking for a missing transaction or need to import from MoMo?`;
      case 'dashboard':
      default:
        return `Hey ${firstName}! 👋 Everything good with your money today, or need a quick hand?`;
    }
  };

  // Pulse animation for the bot icon
  const startBotPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animBubblePulse, {
          toValue: 1.08,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(animBubblePulse, {
          toValue: 1.0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  // Entrance animation
  const animateIn = () => {
    animSlide.setValue(40);
    animOpacity.setValue(0);
    animScale.setValue(0.85);

    Animated.parallel([
      Animated.spring(animSlide, {
        toValue: 0,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(animOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(animScale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start(() => {
      startBotPulse();
    });
  };

  // Minimizing animation
  const animateToMinimized = () => {
    Animated.parallel([
      Animated.timing(animOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(animScale, {
        toValue: 0.8,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStage('minimized');
      animOpacity.setValue(1);
      animScale.setValue(1);
      animSlide.setValue(0);
    });
  };

  // Entrance timing after component mounts
  useEffect(() => {
    const entranceTimer = setTimeout(() => {
      setStage('greeting');
      animateIn();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, 2800);

    return () => clearTimeout(entranceTimer);
  }, []);

  // Idle countdown: if user doesn't respond after 7.5 seconds
  useEffect(() => {
    if (stage !== 'greeting') return;

    const idleTimer = setTimeout(() => {
      setStage('timeout_farewell');
      Haptics.selectionAsync().catch(() => {});

      // After displaying farewell for 2.8 seconds, minimize smoothly
      const farewellTimer = setTimeout(() => {
        animateToMinimized();
      }, 2800);

      return () => clearTimeout(farewellTimer);
    }, 7500);

    return () => clearTimeout(idleTimer);
  }, [stage]);

  // Handle user saying "Yes, help me"
  const handleAcceptHelp = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    animateToMinimized();
    onOpenSupport();
  };

  // Handle user saying "I'm good"
  const handleDismissGreeting = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStage('dismissed_farewell');
    setTimeout(() => {
      animateToMinimized();
    }, 2000);
  };

  if (stage === 'hidden') return null;

  // Minimized floating badge state: subtle, neat, and non-intrusive
  if (stage === 'minimized') {
    return (
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          bottom: bottomOffset,
          right: 20,
          zIndex: 999,
        }}
      >
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onOpenSupport();
          }}
          activeOpacity={0.85}
          className="relative items-center justify-center shadow-lg"
        >
          <GlassSurface
            variant="thick"
            tint="emerald"
            elevated
            radius={28}
            style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
          >
            <View className="items-center justify-center">
              <Bot size={22} color={isDark ? '#4ade80' : '#0d631b'} />
              <View className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white" />
            </View>
          </GlassSurface>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: 16,
        right: 16,
        zIndex: 999,
        alignItems: 'center',
      }}
    >
      <Animated.View
        style={{
          width: '100%',
          maxWidth: 390,
          opacity: animOpacity,
          transform: [{ translateY: animSlide }, { scale: animScale }],
        }}
      >
        <GlassSurface
          variant="thick"
          tint="emerald"
          elevated
          radius={26}
          style={{ padding: 18 }}
        >
          <View className="flex-row items-start">
            {/* Animated Bot Avatar */}
            <Animated.View
              style={{
                transform: [{ scale: animBubblePulse }],
                marginRight: 12,
                marginTop: 2,
              }}
            >
              <View className="w-11 h-11 rounded-2xl bg-primary/20 items-center justify-center border border-primary/30 relative shadow-sm">
                <Bot size={22} color={isDark ? '#4ade80' : '#0d631b'} />
                <View className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
              </View>
            </Animated.View>

            {/* Bubble Content Area */}
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* Close Button in corner */}
              <TouchableOpacity
                onPress={handleDismissGreeting}
                className="absolute -top-1 -right-1 w-7 h-7 rounded-full items-center justify-center"
                accessibilityLabel="Dismiss helper"
              >
                <X size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
              </TouchableOpacity>

              {/* Message State 1: Active Greeting */}
              {stage === 'greeting' && (
                <>
                  <Text
                    className={`font-headline font-bold text-sm mb-1 pr-6 ${
                      isDark ? 'text-white' : 'text-charcoal'
                    }`}
                  >
                    CediSmart Assistant
                  </Text>
                  <Text
                    className={`font-body text-xs leading-relaxed mb-3.5 pr-2 ${
                      isDark ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    {getGreetingMessage()}
                  </Text>

                  {/* Actions: Yes / I'm good */}
                  <View className="flex-row items-center space-x-2.5">
                    <TouchableOpacity
                      onPress={handleAcceptHelp}
                      activeOpacity={0.85}
                      className="bg-primary px-4 py-2.5 rounded-xl flex-row items-center shadow-sm"
                    >
                      <Sparkles size={14} color="white" />
                      <Text className="text-white font-headline font-bold text-xs ml-1.5">
                        Yes, help me
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleDismissGreeting}
                      activeOpacity={0.7}
                      className={`px-3.5 py-2.5 rounded-xl border ${
                        isDark ? 'border-white/15 bg-white/5' : 'border-black/10 bg-black/5'
                      }`}
                    >
                      <Text
                        className={`font-headline font-semibold text-xs ${
                          isDark ? 'text-gray-300' : 'text-gray-600'
                        }`}
                      >
                        I'm good
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Message State 2: Timeout Farewell ("You know where to find me") */}
              {stage === 'timeout_farewell' && (
                <View className="py-1">
                  <Text
                    className={`font-headline font-bold text-sm mb-1 ${
                      isDark ? 'text-white' : 'text-charcoal'
                    }`}
                  >
                    Alright! 🙂
                  </Text>
                  <Text
                    className={`font-body text-xs leading-relaxed ${
                      isDark ? 'text-emerald-300' : 'text-emerald-800'
                    }`}
                  >
                    You know where to find me anytime — tap my icon here or visit Settings &gt; Help.
                  </Text>
                </View>
              )}

              {/* Message State 3: User dismissed ("Have a great day") */}
              {stage === 'dismissed_farewell' && (
                <View className="py-1">
                  <Text
                    className={`font-headline font-bold text-sm mb-1 ${
                      isDark ? 'text-white' : 'text-charcoal'
                    }`}
                  >
                    Awesome! 💪
                  </Text>
                  <Text
                    className={`font-body text-xs leading-relaxed ${
                      isDark ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    Have a great and productive day! Tap my icon below whenever you need me.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
};
