import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop, Text as SvgText, G } from 'react-native-svg';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface CoinProps {
  size: number;
  rotation: string;
  isDark: boolean;
  isPremium?: boolean;
}

const CediCoinSVG = ({ size, rotation, isDark, isPremium }: CoinProps) => {
  // Use slightly different colors for dark mode to blend seamlessly
  let goldLight = isDark ? '#B78A39' : '#FFEFA6';
  let goldMid = isDark ? '#8A641B' : '#E5A93B';
  let goldDark = isDark ? '#4A3408' : '#A05915';
  let textFill = isDark ? '#FFDF79' : '#5E3406';

  if (isPremium) {
    goldLight = isDark ? '#FFF099' : '#FFF9D4'; // Brighter gold highlight
    goldMid = isDark ? '#DAA520' : '#FFD700';   // Shiny yellow gold
    goldDark = isDark ? '#6B5300' : '#B8860B';  // Dark amber shadow
    textFill = isDark ? '#FFE57F' : '#8B6508';  // Rich gold symbol
  }

  return (
    <Svg 
      width={size} 
      height={size} 
      viewBox="0 0 200 200" 
      style={{ transform: [{ rotate: rotation }] }}
    >
      <Defs>
        <RadialGradient
          id={`goldGrad-${size}`}
          cx="35%"
          cy="35%"
          r="65%"
          fx="35%"
          fy="35%"
        >
          <Stop offset="0%" stopColor={goldLight} />
          <Stop offset="55%" stopColor={goldMid} />
          <Stop offset="100%" stopColor={goldDark} />
        </RadialGradient>
      </Defs>

      <G>
        {/* Outer 3D Shadow Ring */}
        <Circle cx="102" cy="102" r="95" fill={isDark ? '#000000' : '#472202'} opacity={0.3} />
        
        {/* Main Coin Body */}
        <Circle cx="100" cy="100" r="95" fill={`url(#goldGrad-${size})`} />
        
        {/* Raised Inner Rim */}
        <Circle cx="100" cy="100" r="88" fill="none" stroke={goldLight} strokeWidth="1.5" opacity={0.5} />
        <Circle cx="100" cy="100" r="85" fill="none" stroke={goldDark} strokeWidth="2" opacity={0.6} />

        {/* Decorative Dotted Border */}
        <Circle 
          cx="100" 
          cy="100" 
          r="78" 
          fill="none" 
          stroke={goldLight} 
          strokeWidth="2.5" 
          strokeDasharray="4, 6" 
          opacity={0.4} 
        />

        {/* Center Cedi Symbol ₵ */}
        <SvgText
          x="100"
          y="124"
          fontSize="88"
          fontWeight="900"
          fontFamily="System"
          textAnchor="middle"
          fill={textFill}
          opacity={0.8}
        >
          ₵
        </SvgText>
        
        {/* Subtle Shine Reflection */}
        <Path
          d="M 25 100 A 75 75 0 0 1 175 100"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="3"
          opacity={0.15}
        />
      </G>
    </Svg>
  );
};

export const CoinBackground = () => {
  const theme = useThemeStore((state) => state.theme);
  const user = useAuthStore((state) => state.user);
  const isDark = theme === 'dark';
  const isPremium = user?.is_premium === true;

  // Opacity increased to make the cedi coins more visible and vibrant for Pro members
  const containerOpacity = isDark 
    ? (isPremium ? 0.18 : 0.12) 
    : (isPremium ? 0.22 : 0.16);

  return (
    <View 
      pointerEvents="none" 
      style={[
        StyleSheet.absoluteFillObject, 
        styles.container, 
        { opacity: containerOpacity }
      ]}
    >
      {/* Top Right Large Coin */}
      <View style={[styles.coinWrapper, { top: -60, right: -80 }]}>
        <CediCoinSVG size={320} rotation="15deg" isDark={isDark} isPremium={isPremium} />
      </View>

      {/* Bottom Left Medium Coin */}
      <View style={[styles.coinWrapper, { bottom: 100, left: -60 }]}>
        <CediCoinSVG size={240} rotation="-25deg" isDark={isDark} isPremium={isPremium} />
      </View>

      {/* Middle Right Small Coin */}
      <View style={[styles.coinWrapper, { top: screenHeight * 0.45, right: -40 }]}>
        <CediCoinSVG size={160} rotation="40deg" isDark={isDark} isPremium={isPremium} />
      </View>

      {/* Upper Left Medium-Small Coin */}
      <View style={[styles.coinWrapper, { top: screenHeight * 0.22, left: -50 }]}>
        <CediCoinSVG size={180} rotation="-15deg" isDark={isDark} isPremium={isPremium} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  coinWrapper: {
    position: 'absolute',
  },
});
