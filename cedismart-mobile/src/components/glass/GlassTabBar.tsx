import React, { useEffect, useRef, useState } from 'react';
import { I18nManager, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BarChart3, Home, Settings, Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../stores/themeStore';
import { useAccessibilityPreferences } from '../../providers/AccessibilityPreferences';
import { GlassSurface } from './GlassSurface';
import { useGlassTabBarMetrics } from './useGlassTabBarMetrics';

const icons: Record<string, typeof Home> = {
  DashboardTab: Home,
  ReportsTab: BarChart3,
  BudgetsTab: Shield,
  SettingsTab: Settings,
};

type TabButtonProps = {
  label: string;
  accessibilityLabel: string;
  testID?: string;
  selected: boolean;
  isDark: boolean;
  reduceMotion: boolean;
  Icon: typeof Home;
  onPress: () => void;
  onLongPress: () => void;
};

function GlassTabItem({
  label,
  accessibilityLabel,
  testID,
  selected,
  isDark,
  reduceMotion,
  Icon,
  onPress,
  onLongPress,
}: TabButtonProps) {
  const scale = useSharedValue(selected ? 1.06 : 1);
  const translateY = useSharedValue(selected ? -1.5 : 0);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      translateY.value = 0;
      return;
    }
    if (selected) {
      scale.value = withSequence(
        withSpring(1.16, { damping: 11, stiffness: 360, mass: 0.45, reduceMotion: ReduceMotion.System }),
        withSpring(1.05, { damping: 14, stiffness: 260, mass: 0.55, reduceMotion: ReduceMotion.System })
      );
      translateY.value = withSpring(-1.5, {
        damping: 14,
        stiffness: 280,
        mass: 0.55,
        reduceMotion: ReduceMotion.System,
      });
    } else {
      scale.value = withSpring(1, { damping: 16, stiffness: 260, mass: 0.6, reduceMotion: ReduceMotion.System });
      translateY.value = withSpring(0, { damping: 16, stiffness: 260, mass: 0.6, reduceMotion: ReduceMotion.System });
    }
  }, [reduceMotion, scale, selected, translateY]);

  const itemAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const color = selected
    ? (isDark ? '#a4f3b9' : '#0d631b')
    : (isDark ? '#c4cec6' : '#556459');

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPressIn={() => {
        if (!reduceMotion) {
          scale.value = withSpring(0.9, {
            damping: 15,
            stiffness: 380,
            mass: 0.45,
            reduceMotion: ReduceMotion.System,
          });
        }
      }}
      onPressOut={() => {
        if (!reduceMotion) {
          scale.value = withSpring(selected ? 1.05 : 1, {
            damping: 13,
            stiffness: 300,
            mass: 0.5,
            reduceMotion: ReduceMotion.System,
          });
        }
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tab}
    >
      <Animated.View style={[styles.tabInner, itemAnimatedStyle]}>
        <Icon color={color} size={22} strokeWidth={selected ? 2.5 : 1.8} />
        <Text
          maxFontSizeMultiplier={1.5}
          style={[styles.label, { color, fontWeight: selected ? '700' : '500' }]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const isDark = useThemeStore(value => value.theme) === 'dark';
  const { reduceMotion } = useAccessibilityPreferences();
  const metrics = useGlassTabBarMetrics();
  const [width, setWidth] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const previousWidth = useRef(0);
  const previousIndex = useRef(state.index);

  const indicatorX = useSharedValue(0);
  const indicatorScaleX = useSharedValue(1);
  const indicatorScaleY = useSharedValue(1);
  const indicatorGlow = useSharedValue(0);

  const tabWidth = Math.max(0, (width - 12) / state.routes.length);
  const activeIndex = I18nManager.isRTL ? state.routes.length - 1 - state.index : state.index;

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    const target = activeIndex * tabWidth;
    const isInitialOrResize = width !== previousWidth.current;
    const distance = Math.abs(activeIndex - previousIndex.current);

    if (reduceMotion || isInitialOrResize) {
      indicatorX.value = target;
      indicatorScaleX.value = 1;
      indicatorScaleY.value = 1;
    } else {
      // Telegram-style liquid droplet stretch & snap on tab switch
      const stretchAmount = Math.min(1.26, 1.12 + distance * 0.05);
      const compressAmount = Math.max(0.86, 0.92 - distance * 0.02);

      indicatorX.value = withSpring(target, {
        damping: 19,
        stiffness: 250,
        mass: 0.68,
        reduceMotion: ReduceMotion.System,
      });
      indicatorScaleX.value = withSequence(
        withTiming(stretchAmount, { duration: 110 }),
        withSpring(1, { damping: 12, stiffness: 260, mass: 0.55, reduceMotion: ReduceMotion.System })
      );
      indicatorScaleY.value = withSequence(
        withTiming(compressAmount, { duration: 110 }),
        withSpring(1, { damping: 12, stiffness: 260, mass: 0.55, reduceMotion: ReduceMotion.System })
      );
      indicatorGlow.value = withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(0, { duration: 320 })
      );
    }

    previousWidth.current = width;
    previousIndex.current = activeIndex;
  }, [activeIndex, indicatorGlow, indicatorScaleX, indicatorScaleY, indicatorX, reduceMotion, tabWidth, width]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: indicatorX.value },
      { scaleX: indicatorScaleX.value },
      { scaleY: indicatorScaleY.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: indicatorGlow.value,
  }));

  if (keyboardVisible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.position,
        { bottom: metrics.bottom, left: metrics.left, right: metrics.right },
      ]}
    >
      <GlassSurface
        radius={36}
        elevated
        intensity={isDark ? 75 : 85}
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        style={[styles.bar, { height: metrics.height }]}
      >
        {width > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: Math.max(0, tabWidth - 8),
                borderColor: isDark ? 'rgba(185, 255, 206, 0.34)' : 'rgba(255, 255, 255, 0.92)',
              },
              indicatorStyle,
            ]}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(164, 243, 185, 0.28)', 'rgba(46, 125, 50, 0.18)', 'rgba(164, 243, 185, 0.22)']
                  : ['rgba(255, 255, 255, 0.92)', 'rgba(220, 245, 226, 0.65)', 'rgba(255, 255, 255, 0.82)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.indicatorRadius]}
            />
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.indicatorRadius,
                {
                  backgroundColor: isDark
                    ? 'rgba(190, 255, 210, 0.22)'
                    : 'rgba(255, 255, 255, 0.55)',
                },
                glowStyle,
              ]}
            />
          </Animated.View>
        )}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const selected = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title ?? route.name;
          const Icon = icons[route.name] ?? Home;

          return (
            <GlassTabItem
              key={route.key}
              label={label}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarTestID}
              selected={selected}
              isDark={isDark}
              reduceMotion={reduceMotion}
              Icon={Icon}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!selected && !event.defaultPrevented) {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 560, padding: 6, flexDirection: 'row', alignItems: 'stretch' },
  indicator: {
    position: 'absolute',
    left: 10,
    top: 6,
    bottom: 6,
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
  },
  indicatorRadius: { borderRadius: 30 },
  tab: { flex: 1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 11, letterSpacing: 0.1 },
});
