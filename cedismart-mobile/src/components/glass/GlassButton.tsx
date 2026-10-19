import React from 'react';
import { Platform, Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { GlassSurface, type GlassTint, type GlassVariant } from './GlassSurface';
import { useThemeStore } from '../../stores/themeStore';
import { useAccessibilityPreferences } from '../../providers/AccessibilityPreferences';

type GlassButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  children: React.ReactNode;
  accessibilityLabel: string;
  size?: number;
  radius?: number;
  caption?: string;
  elevated?: boolean;
  tint?: GlassTint;
  variant?: GlassVariant;
  style?: StyleProp<ViewStyle>;
};

export function GlassButton({
  children,
  size = 44,
  radius = size / 2,
  caption,
  style,
  elevated = false,
  tint = 'default',
  variant = 'regular',
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  accessibilityRole = 'button',
  ...props
}: GlassButtonProps) {
  const { reduceMotion } = useAccessibilityPreferences();
  const isDark = useThemeStore(state => state.theme) === 'dark';

  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: scaleX.value }, { scaleY: scaleY.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const handlePressIn = () => {
    if (reduceMotion) return;
    // Liquid squish: compress slightly more vertically while widening horizontally
    scaleX.value = withSpring(0.95, {
      damping: 15,
      stiffness: 380,
      mass: 0.5,
      reduceMotion: ReduceMotion.System,
    });
    scaleY.value = withSpring(0.9, {
      damping: 15,
      stiffness: 380,
      mass: 0.5,
      reduceMotion: ReduceMotion.System,
    });
    glowOpacity.value = withTiming(1, { duration: 90 });
  };

  const handlePressOut = () => {
    if (reduceMotion) return;
    // Elastic liquid rebound with subtle overshoot bloom
    scaleX.value = withSequence(
      withSpring(1.04, { damping: 12, stiffness: 360, mass: 0.45, reduceMotion: ReduceMotion.System }),
      withSpring(1, { damping: 14, stiffness: 280, mass: 0.55, reduceMotion: ReduceMotion.System })
    );
    scaleY.value = withSequence(
      withSpring(1.03, { damping: 12, stiffness: 360, mass: 0.45, reduceMotion: ReduceMotion.System }),
      withSpring(1, { damping: 14, stiffness: 280, mass: 0.55, reduceMotion: ReduceMotion.System })
    );
    glowOpacity.value = withTiming(0, { duration: 280 });
  };

  return (
    <Animated.View style={[style, animatedStyle]}>
      <Pressable
        {...props}
        disabled={disabled}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ ...props.accessibilityState, disabled: !!disabled }}
        style={styles.pressable}
        onPressIn={event => {
          handlePressIn();
          onPressIn?.(event);
        }}
        onPressOut={event => {
          handlePressOut();
          onPressOut?.(event);
        }}
        onPress={event => {
          if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
          onPress?.(event);
        }}
      >
        <GlassSurface
          radius={radius}
          interactive={!disabled}
          elevated={elevated}
          tint={tint}
          variant={variant}
          style={{
            width: Math.max(44, size),
            height: Math.max(44, size),
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: radius,
                backgroundColor: isDark
                  ? 'rgba(174, 255, 197, 0.24)'
                  : 'rgba(255, 255, 255, 0.65)',
              },
              glowStyle,
            ]}
          />
          {children}
        </GlassSurface>
        {caption && (
          <Text maxFontSizeMultiplier={1.5} style={[styles.caption, { color: isDark ? '#e1e3e0' : '#1c221e' }]}>
            {caption}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressable: { alignItems: 'center' },
  caption: { marginTop: 9, fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
