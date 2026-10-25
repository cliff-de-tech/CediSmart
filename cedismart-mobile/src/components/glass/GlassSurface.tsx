import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore } from '../../stores/themeStore';
import { useAccessibilityPreferences } from '../../providers/AccessibilityPreferences';

function supportsNativeLiquidGlass() {
  try {
    return Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

const nativeLiquidGlassAvailable = supportsNativeLiquidGlass();

export type GlassTint = 'default' | 'emerald' | 'gold' | 'clear';
export type GlassVariant = 'regular' | 'clear' | 'thick';

export type GlassSurfaceProps = ViewProps & {
  radius?: number;
  interactive?: boolean;
  elevated?: boolean;
  intensity?: number;
  tint?: GlassTint;
  variant?: GlassVariant;
  solidFallback?: boolean;
  noBlur?: boolean;
};

export function GlassSurface({
  children,
  style,
  radius = 28,
  interactive = false,
  elevated = false,
  intensity,
  tint = 'default',
  variant = 'regular',
  solidFallback = false,
  noBlur = false,
  ...props
}: GlassSurfaceProps) {
  const theme = useThemeStore(state => state.theme);
  const isDark = theme === 'dark';
  const { reduceMotion, reduceTransparency } = useAccessibilityPreferences();
  const shape = { borderRadius: radius };
  const shadow = elevated ? (isDark ? styles.shadowDarkElevated : styles.shadowLightElevated) : (isDark ? styles.shadowDarkSubtle : styles.shadowLightSubtle);

  const shouldBypassBlur = reduceTransparency || noBlur || (Platform.OS === 'android' && solidFallback);

  const resolvedIntensity = intensity ?? (
    variant === 'clear'
      ? (isDark ? 48 : 58)
      : variant === 'thick'
      ? (isDark ? 85 : 92)
      : (isDark ? 68 : 78)
  );

  const getCausticColors = (): [string, string, string] => {
    if (tint === 'emerald') {
      return isDark
        ? ['rgba(22, 101, 52, 0.68)', 'rgba(11, 42, 20, 0.88)', 'rgba(34, 136, 68, 0.58)']
        : ['rgba(16, 122, 42, 0.94)', 'rgba(13, 99, 27, 0.88)', 'rgba(46, 180, 80, 0.90)'];
    }
    if (tint === 'gold') {
      return isDark
        ? ['rgba(245, 166, 35, 0.42)', 'rgba(48, 36, 14, 0.82)', 'rgba(251, 191, 36, 0.28)']
        : ['rgba(255, 248, 230, 0.90)', 'rgba(254, 243, 199, 0.80)', 'rgba(253, 230, 138, 0.84)'];
    }
    if (tint === 'clear' || variant === 'clear') {
      return isDark
        ? ['rgba(210, 255, 224, 0.20)', 'rgba(18, 28, 22, 0.65)', 'rgba(164, 243, 185, 0.12)']
        : ['rgba(255, 255, 255, 0.86)', 'rgba(240, 249, 242, 0.68)', 'rgba(255, 255, 255, 0.78)'];
    }
    return isDark
      ? ['rgba(28, 44, 34, 0.70)', 'rgba(18, 28, 22, 0.85)', 'rgba(22, 38, 28, 0.75)']
      : ['rgba(255, 255, 255, 0.92)', 'rgba(245, 252, 247, 0.84)', 'rgba(240, 250, 243, 0.88)'];
  };

  const borderColor = tint === 'emerald'
    ? (isDark ? 'rgba(164, 243, 185, 0.38)' : 'rgba(255, 255, 255, 0.55)')
    : tint === 'gold'
    ? (isDark ? 'rgba(251, 191, 36, 0.42)' : 'rgba(245, 158, 11, 0.45)')
    : (isDark ? 'rgba(205, 252, 218, 0.26)' : 'rgba(255, 255, 255, 0.90)');

  const specularRimColors: [string, string, string] = isDark
    ? ['rgba(255, 255, 255, 0.02)', 'rgba(220, 255, 232, 0.45)', 'rgba(255, 255, 255, 0.02)']
    : ['rgba(255, 255, 255, 0.20)', 'rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.20)'];

  // Native iOS 26+ UIGlassEffect path
  if (nativeLiquidGlassAvailable && !shouldBypassBlur) {
    return (
      <GlassView
        {...props}
        style={[shape, shadow, style]}
        glassEffectStyle={variant === 'clear' ? 'clear' : 'regular'}
        colorScheme={theme}
        tintColor={
          tint === 'emerald'
            ? (isDark ? 'rgba(22, 101, 52, 0.45)' : 'rgba(13, 99, 27, 0.75)')
            : tint === 'gold'
            ? 'rgba(245, 158, 11, 0.25)'
            : undefined
        }
        isInteractive={interactive && !reduceMotion}
      >
        {children}
      </GlassView>
    );
  }

  // Telegram-style Liquid Glass engine for iOS 18 (iPhone XR), Android, and Web
  const blurTint = isDark
    ? (variant === 'clear' ? 'systemUltraThinMaterialDark' : 'systemChromeMaterialDark')
    : (variant === 'clear' ? 'systemUltraThinMaterialLight' : 'systemChromeMaterialLight');

  return (
    <View
      {...props}
      style={[
        shape,
        shadow,
        shouldBypassBlur && {
          backgroundColor: isDark
            ? (tint === 'emerald' ? '#0d3218' : '#141e17')
            : (tint === 'emerald' ? '#eaf8ed' : '#ffffff'),
        },
        style,
      ]}
    >
      {/* Clipped optical refraction & specular layers */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, styles.clip]}>
        {!shouldBypassBlur ? (
          <>
            <BlurView
              intensity={resolvedIntensity}
              tint={blurTint}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={getCausticColors()}
              locations={[0, 0.55, 1]}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Top meniscus liquid light reflection */}
            <LinearGradient
              colors={specularRimColors}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 0 }}
              style={styles.topSpecular}
            />
          </>
        ) : (
          <>
            <LinearGradient
              colors={getCausticColors()}
              locations={[0, 0.55, 1]}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Top meniscus liquid light reflection */}
            <LinearGradient
              colors={specularRimColors}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 0 }}
              style={styles.topSpecular}
            />
          </>
        )}
      </View>

      {/* Outer chromatic glass rim */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          shape,
          {
            borderWidth: 1,
            borderColor,
          },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  topSpecular: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1.5,
  },
  shadowDarkElevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.42,
    shadowRadius: 24,
    elevation: 12,
  },
  shadowLightElevated: {
    shadowColor: '#072b12',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 10,
  },
  shadowDarkSubtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  shadowLightSubtle: {
    shadowColor: '#072b12',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
});
