import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Headphones, X } from 'lucide-react-native';
import { GlassSurface } from '../glass/GlassSurface';
import { useThemeStore } from '../../stores/themeStore';

export interface TopBarSupportTooltipProps {
  userName?: string;
  screenContext?: 'dashboard' | 'budgets' | 'transactions' | 'settings' | 'auth';
  onOpenSupport: (options?: { startNewChat?: boolean }) => void;
  topOffset?: number;
  arrowRightOffset?: number;
  delayMs?: number;
}

// Module-level session guard: only pop down once per app launch session
let sessionGreetingShown = false;

export const resetSessionGreeting = () => {
  sessionGreetingShown = false;
};

export const TopBarSupportTooltip: React.FC<TopBarSupportTooltipProps> = ({
  userName,
  screenContext = 'dashboard',
  onOpenSupport,
  topOffset = 64,
  arrowRightOffset = 74,
  delayMs = 20000,
}) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const screenWidth = Dimensions.get('window').width;

  // Stages: 'hidden' | 'greeting' | 'timeout_farewell' | 'dismissed_farewell'
  const [stage, setStage] = useState<'hidden' | 'greeting' | 'timeout_farewell' | 'dismissed_farewell'>('hidden');

  const animSlideY = useRef(new Animated.Value(-14)).current;
  const animOpacity = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.92)).current;

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

  const getGreetingMessage = () => {
    switch (screenContext) {
      case 'budgets':
        return `Hey ${firstName}! 👋 Need any help planning or tracking your budgets today?`;
      case 'transactions':
        return `Hey ${firstName}! 👋 Looking for a missing transaction or MoMo sync?`;
      case 'settings':
        return `Hey ${firstName}! 👋 Need help configuring accounts or MoMo sync?`;
      case 'dashboard':
      default:
        return `Hey ${firstName}! 👋 Everything good with your money today, or need a quick hand?`;
    }
  };

  const animateIn = () => {
    animSlideY.setValue(-14);
    animOpacity.setValue(0);
    animScale.setValue(0.92);

    Animated.parallel([
      Animated.spring(animSlideY, {
        toValue: 0,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(animOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(animScale, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateOut = (callback?: () => void) => {
    Animated.parallel([
      Animated.timing(animOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(animSlideY, {
        toValue: -12,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(animScale, {
        toValue: 0.92,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStage('hidden');
      if (callback) callback();
    });
  };

  // Entrance timer (polite 9 seconds)
  useEffect(() => {
    if (sessionGreetingShown) return;

    const timer = setTimeout(() => {
      if (sessionGreetingShown) return;
      sessionGreetingShown = true;
      setStage('greeting');
      animateIn();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, delayMs);

    return () => clearTimeout(timer);
  }, [delayMs]);

  // Idle timeout: If user doesn't respond within 7.5 seconds
  useEffect(() => {
    if (stage !== 'greeting') return;

    const idleTimer = setTimeout(() => {
      setStage('timeout_farewell');
      Haptics.selectionAsync().catch(() => {});

      const closeTimer = setTimeout(() => {
        animateOut();
      }, 2500);

      return () => clearTimeout(closeTimer);
    }, 7500);

    return () => clearTimeout(idleTimer);
  }, [stage]);

  // Handle user saying "Yes, let's chat" -> opens a fresh new support chat
  const handleAcceptHelp = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    animateOut(() => {
      onOpenSupport({ startNewChat: true });
    });
  };

  // Handle user dismissing
  const handleDismissGreeting = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStage('dismissed_farewell');
    setTimeout(() => {
      animateOut();
    }, 1800);
  };

  if (stage === 'hidden') return null;

  const cardWidth = Math.min(screenWidth - 32, 320);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: topOffset,
        right: 16,
        width: cardWidth,
        zIndex: 9999,
        opacity: animOpacity,
        transform: [{ translateY: animSlideY }, { scale: animScale }],
      }}
    >
      {/* Speech bubble arrow pointer pointing up directly at the Headset icon */}
      <View
        style={{
          position: 'absolute',
          top: -6,
          right: arrowRightOffset,
          width: 0,
          height: 0,
          borderLeftWidth: 6,
          borderRightWidth: 6,
          borderBottomWidth: 6,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: isDark ? 'rgba(16, 38, 22, 0.95)' : 'rgba(255, 255, 255, 0.98)',
          zIndex: 10001,
        }}
      />

      <GlassSurface
        tint="emerald"
        variant="thick"
        elevated
        radius={20}
        style={{
          borderWidth: 1,
          borderColor: isDark ? 'rgba(74, 222, 128, 0.3)' : 'rgba(13, 99, 27, 0.18)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.45 : 0.15,
          shadowRadius: 14,
          elevation: 12,
        }}
      >
        <View className="p-3.5">
          {/* Header Row: Mini Headset + Title + Close Button */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <View
                className={`w-6 h-6 rounded-full items-center justify-center mr-2 border ${
                  isDark
                    ? 'bg-emerald-500/20 border-emerald-500/40'
                    : 'bg-emerald-600/10 border-emerald-600/20'
                }`}
              >
                <Headphones size={13} color={isDark ? '#4ade80' : '#0d631b'} />
              </View>
              <Text
                className={`font-headline font-bold text-xs ${
                  isDark ? 'text-white' : 'text-charcoal'
                }`}
              >
                CediSmart Support
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleDismissGreeting}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className={`w-6 h-6 rounded-full items-center justify-center ${
                isDark ? 'bg-white/10' : 'bg-black/5'
              }`}
              accessibilityLabel="Dismiss greeting"
            >
              <X size={13} color={isDark ? '#9ca3af' : '#6b7280'} />
            </TouchableOpacity>
          </View>

          {/* Speech Text */}
          <Text
            className={`font-body text-xs leading-relaxed mb-3 ${
              isDark ? 'text-emerald-100' : 'text-charcoal'
            }`}
          >
            {stage === 'greeting' && getGreetingMessage()}
            {stage === 'timeout_farewell' &&
              `Alright ${firstName}! I'm always up here if you need me 🙂`}
            {stage === 'dismissed_farewell' &&
              `No problem! Just tap the headset up here anytime.`}
          </Text>

          {/* Action Buttons: Only visible during greeting */}
          {stage === 'greeting' && (
            <View className="flex-row items-center justify-end" style={{ gap: 8 }}>
              <TouchableOpacity
                onPress={handleDismissGreeting}
                className="px-3 py-1.5"
                accessibilityLabel="I'm good"
              >
                <Text
                  className={`font-headline font-semibold text-xs ${
                    isDark ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  I'm good
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleAcceptHelp}
                className="bg-primary px-3.5 py-1.5 rounded-full flex-row items-center shadow-sm"
                accessibilityLabel="Yes, let's chat"
              >
                <Text className="text-white font-headline font-bold text-xs">
                  Yes, let's chat
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </GlassSurface>
    </Animated.View>
  );
};
