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
  ...props
}: GlassSurfaceProps) {
  const theme = useThemeStore(state => state.theme);
  const isDark = theme === 'dark';
  const { reduceMotion, reduceTransparency } = useAccessibilityPreferences();
  const shape = { borderRadius: radius };
  const shadow = elevated ? (isDark ? styles.shadowDarkElevated : styles.shadowLightElevated) : (isDark ? styles.shadowDarkSubtle : styles.shadowLightSubtle);

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
        ? ['rgba(46, 160, 80, 0.34)', 'rgba(14, 48, 24, 0.52)', 'rgba(164, 243, 185, 0.18)']
        : ['rgba(16, 122, 42, 0.88)', 'rgba(13, 99, 27, 0.78)', 'rgba(46, 180, 80, 0.84)'];
    }
    if (tint === 'gold') {
      return isDark
        ? ['rgba(245, 166, 35, 0.28)', 'rgba(38, 28, 12, 0.45)', 'rgba(251, 191, 36, 0.14)']
        : ['rgba(255, 248, 230, 0.75)', 'rgba(254, 243, 199, 0.55)', 'rgba(253, 230, 138, 0.65)'];
    }
    if (tint === 'clear' || variant === 'clear') {
      return isDark
        ? ['rgba(210, 255, 224, 0.14)', 'rgba(18, 28, 22, 0.28)', 'rgba(164, 243, 185, 0.08)']
        : ['rgba(255, 255, 255, 0.62)', 'rgba(240, 249, 242, 0.38)', 'rgba(255, 255, 255, 0.48)'];
    }
    return isDark
      ? ['rgba(195, 250, 212, 0.16)', 'rgba(18, 28, 22, 0.46)', 'rgba(130, 220, 158, 0.09)']
      : ['rgba(255, 255, 255, 0.78)', 'rgba(242, 250, 244, 0.56)', 'rgba(232, 246, 236, 0.68)'];
  };

  const borderColor = tint === 'emerald'
    ? (isDark ? 'rgba(164, 243, 185, 0.34)' : 'rgba(255, 255, 255, 0.45)')
    : tint === 'gold'
    ? (isDark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(245, 158, 11, 0.35)')
    : (isDark ? 'rgba(205, 252, 218, 0.22)' : 'rgba(255, 255, 255, 0.85)');

  const specularRimColors: [string, string, string] = isDark
    ? ['rgba(255, 255, 255, 0.02)', 'rgba(220, 255, 232, 0.42)', 'rgba(255, 255, 255, 0.02)']
    : ['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.15)'];

  // Native iOS 26+ UIGlassEffect path
  if (nativeLiquidGlassAvailable && !reduceTransparency) {
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
        reduceTransparency && {
          backgroundColor: isDark ? '#16201a' : '#f2f8f4',
        },
        style,
      ]}
    >
      {/* Clipped optical refraction & specular layers */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, styles.clip]}>
        {!reduceTransparency && (
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
