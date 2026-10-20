import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'executed';

interface VoiceOrbProps {
  state: VoiceState;
  audioLevel?: number; // 0.0 to 1.0 for live mic/speech amplitude
  size?: number;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  audioLevel = 0,
  size = 180,
}) => {
  // Shared animation values
  const scale = useSharedValue(1);
  const ring1Scale = useSharedValue(1);
  const ring1Opacity = useSharedValue(0.4);
  const ring2Scale = useSharedValue(1);
  const ring2Opacity = useSharedValue(0.2);
  const ring3Scale = useSharedValue(1);
  const ring3Opacity = useSharedValue(0.1);
  const rotation = useSharedValue(0);
  const glowIntensity = useSharedValue(0.8);

  useEffect(() => {
    switch (state) {
      case 'idle':
        // Gentle ambient breathing
        scale.value = withRepeat(
          withTiming(1.05, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        ring1Scale.value = withRepeat(
          withTiming(1.2, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        ring1Opacity.value = withRepeat(
          withTiming(0.25, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        ring2Scale.value = 1.35;
        ring2Opacity.value = 0.1;
        ring3Scale.value = 1.5;
        ring3Opacity.value = 0.05;
        rotation.value = withRepeat(
          withTiming(360, { duration: 25000, easing: Easing.linear }),
          -1,
          false
        );
        break;

      case 'listening':
        // Active reactive breathing expanding as user speaks
        scale.value = withRepeat(
          withTiming(1.12, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        ring1Scale.value = withRepeat(
          withTiming(1.38, { duration: 1200, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring1Opacity.value = withRepeat(
          withTiming(0.55, { duration: 1200, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring2Scale.value = withRepeat(
          withTiming(1.65, { duration: 1500, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring2Opacity.value = withRepeat(
          withTiming(0.3, { duration: 1500, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring3Scale.value = withRepeat(
          withTiming(1.9, { duration: 1800, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring3Opacity.value = withRepeat(
          withTiming(0.18, { duration: 1800, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        rotation.value = withRepeat(
          withTiming(360, { duration: 16000, easing: Easing.linear }),
          -1,
          false
        );
        break;

      case 'thinking':
        // Rapid concentric spin and tense pulsing
        scale.value = withRepeat(
          withTiming(1.08, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        ring1Scale.value = withRepeat(
          withTiming(1.28, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        ring1Opacity.value = 0.6;
        ring2Scale.value = withRepeat(
          withTiming(1.5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        ring2Opacity.value = 0.35;
        rotation.value = withRepeat(
          withTiming(360, { duration: 3000, easing: Easing.linear }),
          -1,
          false
        );
        break;

      case 'speaking':
        // Wave-like dynamic audio pulse
        scale.value = withRepeat(
          withSequence(
            withTiming(1.15, { duration: 380, easing: Easing.out(Easing.quad) }),
            withTiming(0.96, { duration: 420, easing: Easing.in(Easing.quad) })
          ),
          -1,
          true
        );
        ring1Scale.value = withRepeat(
          withTiming(1.45, { duration: 550, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring1Opacity.value = withRepeat(
          withTiming(0.65, { duration: 550, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring2Scale.value = withRepeat(
          withTiming(1.78, { duration: 750, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring2Opacity.value = withRepeat(
          withTiming(0.35, { duration: 750, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring3Scale.value = withRepeat(
          withTiming(2.1, { duration: 950, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        ring3Opacity.value = withRepeat(
          withTiming(0.2, { duration: 950, easing: Easing.out(Easing.ease) }),
          -1,
          true
        );
        rotation.value = withRepeat(
          withTiming(360, { duration: 12000, easing: Easing.linear }),
          -1,
          false
        );
        break;

      case 'executed':
        // Spring bounce pop on successful action execution
        scale.value = withSequence(
          withSpring(1.3, { damping: 10, stiffness: 180 }),
          withSpring(1.0, { damping: 12, stiffness: 120 })
        );
        ring1Scale.value = withSequence(
          withTiming(1.9, { duration: 400 }),
          withTiming(1.2, { duration: 400 })
        );
        ring1Opacity.value = withSequence(
          withTiming(0.8, { duration: 200 }),
          withTiming(0.2, { duration: 600 })
        );
        break;
    }
  }, [state]);

  const coreAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value + audioLevel * 0.25 },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const ring1AnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value + audioLevel * 0.3 }],
    opacity: ring1Opacity.value,
  }));

  const ring2AnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value + audioLevel * 0.45 }],
    opacity: ring2Opacity.value,
  }));

  const ring3AnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring3Scale.value + audioLevel * 0.6 }],
    opacity: ring3Opacity.value,
  }));

  // Gradient themes matching ChatGPT Voice with CediSmart Emerald aesthetic
  const getGradientColors = (): [string, string, string] => {
    switch (state) {
      case 'listening':
        // Vibrant emerald / cyan aura
        return ['#10B981', '#059669', '#047857'];
      case 'thinking':
        // Amber / emerald shimmer
        return ['#34D399', '#059669', '#10B981'];
      case 'speaking':
        // Radiant emerald / teal
        return ['#6EE7B7', '#10B981', '#065F46'];
      case 'executed':
        // Golden emerald victory
        return ['#FBBF24', '#10B981', '#047857'];
      case 'idle':
      default:
        // Calm obsidian / deep emerald
        return ['#059669', '#047857', '#064E3B'];
    }
  };

  const colors = getGradientColors();

  return (
    <View style={[styles.container, { width: size * 2.2, height: size * 2.2 }]}>
      {/* Outer Ripple Wave 3 */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors[0],
            backgroundColor: `${colors[0]}15`,
          },
          ring3AnimatedStyle,
        ]}
      />

      {/* Middle Ripple Wave 2 */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors[1],
            backgroundColor: `${colors[1]}25`,
          },
          ring2AnimatedStyle,
        ]}
      />

      {/* Inner Ripple Wave 1 */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors[0],
            backgroundColor: `${colors[0]}35`,
          },
          ring1AnimatedStyle,
        ]}
      />

      {/* Main Core Orb */}
      <Animated.View
        style={[
          styles.coreOrb,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            shadowColor: colors[0],
          },
          coreAnimatedStyle,
        ]}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.gradient}
        >
          {/* Inner Light Reflection Sphere (Liquid Glass 3D Effect) */}
          <View
            style={[
              styles.innerReflection,
              {
                width: size * 0.45,
                height: size * 0.45,
                borderRadius: (size * 0.45) / 2,
              },
            ]}
          />
        </LinearGradient>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  coreOrb: {
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 36,
    elevation: 20,
  },
  gradient: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 16,
  },
  innerReflection: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    filter: 'blur(4px)',
  },
});
