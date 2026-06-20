import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface ConfettiEffectProps {
  active: boolean;
  onComplete: () => void;
}

const GOLD_COLORS = ['#FFD700', '#DAA520', '#FFDF79', '#FFF5C0', '#E6B500', '#FF8C00'];

export const ConfettiEffect: React.FC<ConfettiEffectProps> = ({ active, onComplete }) => {
  const particles = useRef(
    Array.from({ length: 35 }).map(() => ({
      x: new Animated.Value(screenWidth / 2),
      y: new Animated.Value(-20),
      scale: new Animated.Value(0),
      opacity: new Animated.Value(1),
      color: GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)],
      size: Math.random() * 8 + 6,
      angle: Math.random() * Math.PI * 2,
      speed: Math.random() * 200 + 150,
      rotation: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    if (!active) return;

    // Reset animations
    particles.forEach((p) => {
      p.x.setValue(screenWidth / 2);
      p.y.setValue(-20);
      p.scale.setValue(0);
      p.opacity.setValue(1);
      p.rotation.setValue(0);
    });

    const animations = particles.map((p) => {
      // Calculate target horizontal offset and vertical fall
      const targetX = screenWidth / 2 + Math.cos(p.angle) * (Math.random() * 150 + 50);
      const targetY = screenHeight * 0.75 + Math.random() * 150;
      const duration = Math.random() * 1000 + 1500;

      return Animated.parallel([
        Animated.timing(p.x, {
          toValue: targetX,
          duration: duration,
          useNativeDriver: true,
        }),
        Animated.timing(p.y, {
          toValue: targetY,
          duration: duration,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(p.scale, {
            toValue: Math.random() * 0.8 + 0.5,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(p.scale, {
            toValue: 0,
            duration: duration - 200,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: duration,
          useNativeDriver: true,
        }),
        Animated.timing(p.rotation, {
          toValue: Math.random() * 360,
          duration: duration,
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.parallel(animations).start(() => {
      onComplete();
    });
  }, [active]);

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, index) => {
        const rotate = p.rotation.interpolate({
          inputRange: [0, 360],
          outputRange: ['0deg', '360deg'],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.particle,
              {
                backgroundColor: p.color,
                width: p.size,
                height: p.size,
                transform: [
                  { translateX: p.x },
                  { translateY: p.y },
                  { scale: p.scale },
                  { rotate: rotate },
                ],
                opacity: p.opacity,
                borderRadius: Math.random() > 0.5 ? p.size / 2 : 2, // Mix of circles and squares
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
