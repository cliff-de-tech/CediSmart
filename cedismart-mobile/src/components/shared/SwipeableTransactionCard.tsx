import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Dimensions, View, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface SwipeableTransactionCardProps {
  onDelete: () => void;
  onCategorize?: () => void;
  onPress: () => void;
  children: React.ReactNode;
  isDark?: boolean;
}

const ACTION_WIDTH = 84;
const CARD_MARGIN_BOTTOM = 10;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Full-swipe threshold (~42% of screen width) or fast leftward flick
const FULL_SWIPE_THRESHOLD = SCREEN_WIDTH * 0.42;

export const SwipeableTransactionCard: React.FC<SwipeableTransactionCardProps> = ({
  onDelete,
  onPress,
  children,
}) => {
  const translateX = useSharedValue(0);
  const isDeleting = useSharedValue(false);
  const hasTriggeredHaptic = useSharedValue(false);
  const measuredHeight = useSharedValue(0);
  const collapseProgress = useSharedValue(1);

  const triggerThresholdHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const triggerCancelHaptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const triggerDeleteHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, []);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const h = event.nativeEvent.layout.height;
      if (h > 0 && measuredHeight.value === 0) {
        measuredHeight.value = h;
      }
    },
    [measuredHeight]
  );

  const gesture = useMemo(() => {
    const panGesture = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-14, 14])
      .shouldCancelWhenOutside(false)
      .onUpdate((event) => {
        if (isDeleting.value) return;

        // Clamp to <= 0 so swiping right never overshoots past default position
        const nextX = Math.min(0, event.translationX);
        translateX.value = nextX;

        // Tactile detent when crossing the full-swipe delete threshold
        if (nextX < -FULL_SWIPE_THRESHOLD) {
          if (!hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = true;
            runOnJS(triggerThresholdHaptic)();
          }
        } else if (hasTriggeredHaptic.value) {
          hasTriggeredHaptic.value = false;
          runOnJS(triggerCancelHaptic)();
        }
      })
      .onFinalize((event) => {
        if (isDeleting.value) return;

        const currentX = translateX.value;
        const isPushingBackRight = event.velocityX > 120;
        const shouldDelete =
          (!isPushingBackRight && currentX < -FULL_SWIPE_THRESHOLD) ||
          currentX < -SCREEN_WIDTH * 0.7 ||
          (currentX < -75 && event.velocityX < -650);

        if (shouldDelete) {
          isDeleting.value = true;
          runOnJS(triggerDeleteHaptic)();

          // Stage 1: Glide card completely off the left edge
          translateX.value = withTiming(
            -SCREEN_WIDTH - 40,
            {
              duration: 175,
              easing: Easing.out(Easing.cubic),
            },
            (finished) => {
              if (finished) {
                // Stage 2: Smoothly collapse row height to 0 like native iOS Recents
                collapseProgress.value = withTiming(
                  0,
                  {
                    duration: 210,
                    easing: Easing.out(Easing.cubic),
                  },
                  (collapsed) => {
                    if (collapsed) {
                      runOnJS(onDelete)();
                    }
                  }
                );
              }
            }
          );
        } else {
          // Not fully swiped out -> Always spring smoothly back to default position (0)
          hasTriggeredHaptic.value = false;
          translateX.value = withSpring(0, {
            damping: 26,
            stiffness: 340,
            mass: 0.65,
            overshootClamping: true,
          });
        }
      });

    const tapGesture = Gesture.Tap()
      .maxDistance(8)
      .onEnd((_event, success) => {
        if (success && !isDeleting.value && Math.abs(translateX.value) < 4) {
          runOnJS(onPress)();
        }
      });

    return Gesture.Exclusive(panGesture, tapGesture);
  }, [
    collapseProgress,
    hasTriggeredHaptic,
    isDeleting,
    onDelete,
    onPress,
     translateX,
    triggerCancelHaptic,
    triggerDeleteHaptic,
    triggerThresholdHaptic,
  ]);

  // Outer container collapses smoothly to 0 height on full-swipe delete
  const containerAnimatedStyle = useAnimatedStyle(() => {
    if (collapseProgress.value >= 1 || measuredHeight.value === 0) {
      return {
        marginBottom: CARD_MARGIN_BOTTOM,
        opacity: 1,
      };
    }
    return {
      height: measuredHeight.value * collapseProgress.value,
      marginBottom: CARD_MARGIN_BOTTOM * collapseProgress.value,
      opacity: interpolate(
        collapseProgress.value,
        [0, 0.3, 1],
        [0, 0.8, 1],
        Extrapolation.CLAMP
      ),
    };
  });

  // Foreground card 120fps horizontal translation
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Red background is strictly invisible (opacity: 0) at rest
  const deleteBackgroundStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-24, -2, 0],
      [1, 0.25, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  // White trash icon stays in right 84px zone initially, then tracks with the card's trailing edge
  const deleteIconStyle = useAnimatedStyle(() => {
    const iconTranslateX = interpolate(
      translateX.value,
      [-SCREEN_WIDTH, -ACTION_WIDTH, 0],
      [-(SCREEN_WIDTH - ACTION_WIDTH), 0, 0],
      Extrapolation.CLAMP
    );

    const iconScale = interpolate(
      translateX.value,
      [-SCREEN_WIDTH, -FULL_SWIPE_THRESHOLD, -ACTION_WIDTH, 0],
      [1.22, 1.18, 1.0, 0.8],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ translateX: iconTranslateX }, { scale: iconScale }],
    };
  });

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      {/* Apple System Red (#FF3B30) Full-Bleed Reveal Layer */}
      <Animated.View
        pointerEvents="none"
        style={[styles.deleteBackground, deleteBackgroundStyle]}
      >
        <View style={styles.deleteIconZone}>
          <Animated.View style={[styles.iconWrapper, deleteIconStyle]}>
            <Trash2 size={24} color="#ffffff" strokeWidth={2.3} />
          </Animated.View>
        </View>
      </Animated.View>

      {/* Native 120fps Gesture-Driven Foreground Card */}
      <GestureDetector gesture={gesture}>
        <Animated.View onLayout={handleLayout} style={cardAnimatedStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  deleteBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF3B30',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  deleteIconZone: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: (ACTION_WIDTH - 24) / 2,
  },
  iconWrapper: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
