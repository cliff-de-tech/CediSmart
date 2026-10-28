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

const KEY_SIZE = 70;

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
      scaleX.value = withSpring(0.92, { damping: 14, stiffness: 360 });
      scaleY.value = withSpring(0.92, { damping: 14, stiffness: 360 });
      glowOpacity.value = withSpring(1, { damping: 15, stiffness: 320 });
    }
  };

  const handlePressOut = () => {
    if (disabled) return;
    if (!reduceMotion) {
      scaleX.value = withSequence(
        withSpring(1.05, { damping: 10, stiffness: 320 }),
        withSpring(1, { damping: 14, stiffness: 260 }),
      );
      scaleY.value = withSequence(
        withSpring(1.05, { damping: 10, stiffness: 320 }),
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
          if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={styles.keyCircle}
      >
        <Animated.View style={[styles.keyCircle, animatedStyle]}>
          <GlassSurface
            variant="clear"
            solidFallback
            radius={KEY_SIZE / 2}
            intensity={isDark ? 36 : 46}
            style={styles.keyGlass}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: KEY_SIZE / 2,
                  backgroundColor: isDark
                    ? 'rgba(74, 222, 128, 0.22)'
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

  const rows = [
    [
      { digit: '1', letters: '' },
      { digit: '2', letters: 'ABC' },
      { digit: '3', letters: 'DEF' },
    ],
    [
      { digit: '4', letters: 'GHI' },
      { digit: '5', letters: 'JKL' },
      { digit: '6', letters: 'MNO' },
    ],
    [
      { digit: '7', letters: 'PQRS' },
      { digit: '8', letters: 'TUV' },
      { digit: '9', letters: 'WXYZ' },
    ],
    [
      { digit: null, letters: '' },
      { digit: '0', letters: '' },
      { digit: 'backspace', letters: '' },
    ],
  ];

  return (
    <View style={styles.container}>
      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((key, keyIndex) => {
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
                      <ScanFace color={isDark ? '#4ade80' : '#0d631b'} size={24} />
                    ) : (
                      <Fingerprint color={isDark ? '#4ade80' : '#0d631b'} size={24} />
                    )}
                  </PINKey>
                );
              }
              return <View key={`empty-${keyIndex}`} style={styles.keySlot} />;
            }

            if (key.digit === 'backspace') {
              return (
                <PINKey
                  key="backspace"
                  onPress={onBackspace}
                  disabled={disabled}
                  accessibilityLabel="Backspace"
                >
                  <Delete color={isDark ? '#e1e3e0' : '#1c1b1f'} size={22} />
                </PINKey>
              );
            }

            return (
              <PINKey
                key={key.digit}
                onPress={() => onPress(key.digit)}
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
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 290,
    alignSelf: 'center',
    paddingVertical: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
    width: '100%',
  },
  keySlot: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyCircle: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
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
