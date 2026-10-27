import React, { useRef, useState } from 'react';
import {
  View,
  Animated,
  PanResponder,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Easing,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Trash2, Tag } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SwipeableTransactionCardProps {
  onDelete: () => void;
  onCategorize?: () => void;
  onPress: () => void;
  children: React.ReactNode;
  isDark?: boolean;
}

const ACTION_WIDTH = 84;
const SWIPE_SNAP_THRESHOLD = 45;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FULL_SWIPE_THRESHOLD = SCREEN_WIDTH * 0.52; // ~200-220px on modern screens

export const SwipeableTransactionCard: React.FC<SwipeableTransactionCardProps> = ({
  onDelete,
  onCategorize,
  onPress,
  children,
  isDark = true,
}) => {
  const pan = useRef(new Animated.Value(0)).current;
  const currentOffset = useRef(0);
  const [isOpen, setIsOpen] = useState<'left' | 'right' | null>(null);
  const hasTriggeredHaptic = useRef(false);

  const resetPosition = (animated = true) => {
    currentOffset.current = 0;
    setIsOpen(null);
    hasTriggeredHaptic.current = false;
    if (animated) {
      Animated.spring(pan, {
        toValue: 0,
        tension: 50,
        friction: 9,
        useNativeDriver: true,
      }).start();
    } else {
      pan.setValue(0);
    }
  };

  const snapTo = (toValue: number, state: 'left' | 'right' | null) => {
    currentOffset.current = toValue;
    setIsOpen(state);
    hasTriggeredHaptic.current = false;
    Animated.spring(pan, {
      toValue,
      tension: 50,
      friction: 9,
      useNativeDriver: true,
    }).start();
  };

  const executeDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Animated.timing(pan, {
      toValue: -SCREEN_WIDTH - 60,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      onDelete();
      resetPosition(false);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 8;
      },
      onPanResponderGrant: () => {
        pan.stopAnimation((value) => {
          currentOffset.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        let newX = currentOffset.current + gestureState.dx;

        // Block swiping right if no categorize action
        if (!onCategorize && newX > 0) {
          newX = 0;
        }

        // Apple-style tactile threshold feedback when pulling past full swipe:
        if (newX < -FULL_SWIPE_THRESHOLD) {
          if (!hasTriggeredHaptic.current) {
            hasTriggeredHaptic.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }
        } else {
          if (hasTriggeredHaptic.current) {
            hasTriggeredHaptic.current = false;
            Haptics.selectionAsync().catch(() => {});
          }
        }

        // Rubber-band resistance past action width when swiping right (categorize)
        if (onCategorize && newX > ACTION_WIDTH) {
          const excess = newX - ACTION_WIDTH;
          newX = ACTION_WIDTH + Math.pow(excess, 0.85);
        }

        pan.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const netDx = currentOffset.current + gestureState.dx;
        const vx = gestureState.vx;

        // 1. Full Swipe Left -> Instant Delete without needing to tap the button
        if (netDx < -FULL_SWIPE_THRESHOLD || (netDx < -ACTION_WIDTH && vx < -1.4)) {
          executeDelete();
          return;
        }

        // 2. Snap Open to Reveal Delete Button
        if (netDx < -SWIPE_SNAP_THRESHOLD) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          snapTo(-ACTION_WIDTH, 'right');
          return;
        }

        // 3. Snap Open to Categorize (if enabled)
        if (onCategorize && netDx > SWIPE_SNAP_THRESHOLD) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          snapTo(ACTION_WIDTH, 'left');
          return;
        }

        // 4. Incomplete swipe -> Revert smoothly to default position
        resetPosition(true);
      },
    })
  ).current;

  // Strict dynamic opacity: strictly 0 at rest (pan === 0)
  const deleteOpacity = pan.interpolate({
    inputRange: [-ACTION_WIDTH, -15, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: 'clamp',
  });

  // Trash icon tracks the card once pulled past ACTION_WIDTH (-84px)
  const deleteIconTranslateX = pan.interpolate({
    inputRange: [-SCREEN_WIDTH, -ACTION_WIDTH, 0],
    outputRange: [-(SCREEN_WIDTH - ACTION_WIDTH), 0, 0],
    extrapolate: 'clamp',
  });

  // Trash icon scales subtly and pops on full-swipe threshold
  const deleteIconScale = pan.interpolate({
    inputRange: [-SCREEN_WIDTH, -FULL_SWIPE_THRESHOLD, -ACTION_WIDTH, 0],
    outputRange: [1.25, 1.2, 1.0, 0.8],
    extrapolate: 'clamp',
  });

  // Categorize action interpolations
  const categoryOpacity = onCategorize
    ? pan.interpolate({
        inputRange: [0, 15, ACTION_WIDTH],
        outputRange: [0, 0.4, 1],
        extrapolate: 'clamp',
      })
    : 0;

  const categoryIconTranslateX = onCategorize
    ? pan.interpolate({
        inputRange: [0, ACTION_WIDTH, SCREEN_WIDTH],
        outputRange: [0, 0, SCREEN_WIDTH - ACTION_WIDTH],
        extrapolate: 'clamp',
      })
    : 0;

  const categoryIconScale = onCategorize
    ? pan.interpolate({
        inputRange: [0, ACTION_WIDTH, FULL_SWIPE_THRESHOLD],
        outputRange: [0.8, 1.0, 1.2],
        extrapolate: 'clamp',
      })
    : 1;

  const handleCardPress = () => {
    if (isOpen) {
      resetPosition(true);
    } else {
      onPress();
    }
  };

  return (
    <View style={styles.container}>
      {/* Red Delete Background Layer (Pinned & Expanding) */}
      <Animated.View
        style={[
          styles.deleteBackground,
          {
            opacity: deleteOpacity,
          },
        ]}
        pointerEvents={isOpen === 'right' ? 'auto' : 'box-none'}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={executeDelete}
          style={styles.deleteTouchable}
        >
          <Animated.View
            style={[
              styles.iconWrapper,
              {
                transform: [
                  { translateX: deleteIconTranslateX },
                  { scale: deleteIconScale },
                ],
              },
            ]}
          >
            <Trash2 size={24} color="#ffffff" strokeWidth={2.4} />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {/* Emerald Categorize Background Layer */}
      {onCategorize && (
        <Animated.View
          style={[
            styles.categoryBackground,
            {
              opacity: categoryOpacity,
            },
          ]}
          pointerEvents={isOpen === 'left' ? 'auto' : 'box-none'}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              resetPosition(true);
              onCategorize();
            }}
            style={styles.categoryTouchable}
          >
            <Animated.View
              style={[
                styles.iconWrapper,
                {
                  transform: [
                    { translateX: categoryIconTranslateX },
                    { scale: categoryIconScale },
                  ],
                },
              ]}
            >
              <Tag size={24} color="#ffffff" strokeWidth={2.4} />
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Swiping Foreground Card */}
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          transform: [{ translateX: pan }],
        }}
      >
        <TouchableOpacity activeOpacity={0.85} onPress={handleCardPress}>
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 10,
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
  deleteTouchable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: (ACTION_WIDTH - 24) / 2, // Centers the 24px icon in 84px zone
  },
  categoryBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#10B981',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'flex-start',
    overflow: 'hidden',
  },
  categoryTouchable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: (ACTION_WIDTH - 24) / 2,
  },
  iconWrapper: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
