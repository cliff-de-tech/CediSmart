import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { Delete, Fingerprint, ScanFace } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { useThemeStore } from '../../stores/themeStore';
import { GlassSurface } from '../glass/GlassSurface';
import { useAccessibilityPreferences } from '../../providers/AccessibilityPreferences';

interface PINPadProps {
  onPress: (digit: string) => void;
  onBackspace: () => void;
  onBiometricPress?: () => void;
  biometricType?: 'fingerprint' | 'face' | null;
  disabled?: boolean;
}

interface PINKeyProps {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  children: React.ReactNode;
}

const PINKey: React.FC<PINKeyProps> = ({
  onPress,
  disabled = false,
  accessibilityLabel,
  children,
}) => {
  const isDark = useThemeStore((state) => state.theme) === 'dark';
  const { reduceMotion } = useAccessibilityPreferences();

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
    if (disabled) return;
    if (!reduceMotion) {
      scaleX.value = withSpring(0.9, { damping: 14, stiffness: 360 });
      scaleY.value = withSpring(0.9, { damping: 14, stiffness: 360 });
      glowOpacity.value = withSpring(1, { damping: 15, stiffness: 320 });
    }
  };

  const handlePressOut = () => {
    if (disabled) return;
    if (!reduceMotion) {
      scaleX.value = withSequence(
        withSpring(1.06, { damping: 10, stiffness: 320 }),
        withSpring(1, { damping: 14, stiffness: 260 }),
      );
      scaleY.value = withSequence(
        withSpring(1.06, { damping: 10, stiffness: 320 }),
        withSpring(1, { damping: 14, stiffness: 260 }),
      );
      glowOpacity.value = withSpring(0, { damping: 18, stiffness: 220 });
    }
  };

  return (
    <View style={styles.keySlot}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.keyCircle}
      >
        <Animated.View style={[styles.keyCircle, animatedStyle]}>
          <GlassSurface
            variant="clear"
            radius={37}
            intensity={isDark ? 36 : 46}
            style={styles.keyGlass}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: 37,
                  backgroundColor: isDark
                    ? 'rgba(74, 222, 128, 0.24)'
                    : 'rgba(255, 255, 255, 0.55)',
                },
                glowStyle,
              ]}
            />
            {children}
          </GlassSurface>
        </Animated.View>
      </Pressable>
    </View>
  );
};

const PINPad: React.FC<PINPadProps> = ({
  onPress,
  onBackspace,
  onBiometricPress,
  disabled = false,
}) => {
  const isDark = useThemeStore((state) => state.theme) === 'dark';

  const keys = [
    { digit: '1', letters: '' },
    { digit: '2', letters: 'ABC' },
    { digit: '3', letters: 'DEF' },
    { digit: '4', letters: 'GHI' },
    { digit: '5', letters: 'JKL' },
    { digit: '6', letters: 'MNO' },
    { digit: '7', letters: 'PQRS' },
    { digit: '8', letters: 'TUV' },
    { digit: '9', letters: 'WXYZ' },
    { digit: null, letters: '' },
    { digit: '0', letters: '' },
    { digit: 'backspace', letters: '' },
  ];

  return (
    <View className="w-full max-w-[300px] self-center">
      <View className="flex-row flex-wrap justify-between items-center">
        {keys.map((key, index) => {
          if (key.digit === null) {
            if (onBiometricPress) {
              return (
                <PINKey
                  key="biometric"
                  onPress={onBiometricPress}
                  disabled={disabled}
                  accessibilityLabel="Biometric Authentication"
                >
                  {Platform.OS === 'ios' ? (
                    <ScanFace color={isDark ? '#4ade80' : '#0d631b'} size={26} />
                  ) : (
                    <Fingerprint color={isDark ? '#4ade80' : '#0d631b'} size={26} />
                  )}
                </PINKey>
              );
            }
            return <View key={`empty-${index}`} style={styles.keySlot} />;
          }

          if (key.digit === 'backspace') {
            return (
              <PINKey
                key="backspace"
                onPress={onBackspace}
                disabled={disabled}
                accessibilityLabel="Backspace"
              >
                <Delete color={isDark ? '#e1e3e0' : '#1c1b1f'} size={24} />
              </PINKey>
            );
          }

          return (
            <PINKey
              key={key.digit}
              onPress={() => onPress(key.digit!)}
              disabled={disabled}
              accessibilityLabel={key.digit}
            >
              <View className="items-center justify-center">
                <Text
                  className={`text-2xl font-headline font-bold leading-7 ${
                    isDark ? 'text-dark-on-surface' : 'text-on-surface'
                  }`}
                >
                  {key.digit}
                </Text>
                {key.letters ? (
                  <Text
                    className={`text-[8px] font-bold ${
                      isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'
                    } uppercase tracking-widest`}
                  >
                    {key.letters}
                  </Text>
                ) : null}
              </View>
            </PINKey>
          );
        })}
      </View>
    </View>
  );
};

const KEY_SIZE = 74;

const styles = StyleSheet.create({
  keySlot: {
    width: '33.33%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    height: KEY_SIZE,
  },
  keyCircle: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
  },
  keyGlass: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PINPad;
