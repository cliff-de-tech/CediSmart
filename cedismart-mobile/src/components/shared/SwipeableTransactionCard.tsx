import React, { useRef, useState } from 'react';
import {
  View,
  Animated,
  PanResponder,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Trash2, Tag } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface SwipeableTransactionCardProps {
  onDelete: () => void;
  onCategorize?: () => void;
  onPress: () => void;
  children: React.ReactNode;
  isDark?: boolean;
}

const ACTION_WIDTH = 84;
const SWIPE_THRESHOLD = 45;
const FULL_SWIPE_THRESHOLD = 160;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

  const resetPosition = (animated = true) => {
    currentOffset.current = 0;
    setIsOpen(null);
    if (animated) {
      Animated.spring(pan, {
        toValue: 0,
        tension: 45,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      pan.setValue(0);
    }
  };

  const snapTo = (toValue: number, state: 'left' | 'right' | null) => {
    currentOffset.current = toValue;
    setIsOpen(state);
    Animated.spring(pan, {
      toValue,
      tension: 45,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dy) < 10;
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

        // Apple-style drag resistance beyond ACTION_WIDTH
        if (newX < -ACTION_WIDTH) {
          const excess = Math.abs(newX) - ACTION_WIDTH;
          newX = -(ACTION_WIDTH + Math.pow(excess, 0.85));
        } else if (newX > ACTION_WIDTH) {
          const excess = newX - ACTION_WIDTH;
          newX = ACTION_WIDTH + Math.pow(excess, 0.85);
        }

        pan.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const netDx = currentOffset.current + gestureState.dx;

        if (netDx < -FULL_SWIPE_THRESHOLD) {
          // Full swipe Left -> Instant Delete
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          Animated.timing(pan, {
            toValue: -SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
            resetPosition(false);
          });
        } else if (netDx < -SWIPE_THRESHOLD) {
          // Snap Open to Delete
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          snapTo(-ACTION_WIDTH, 'right');
        } else if (onCategorize && netDx > FULL_SWIPE_THRESHOLD) {
          // Full swipe Right -> Instant Categorize
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          Animated.timing(pan, {
            toValue: SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onCategorize();
            resetPosition(false);
          });
        } else if (onCategorize && netDx > SWIPE_THRESHOLD) {
          // Snap Open to Categorize
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          snapTo(ACTION_WIDTH, 'left');
        } else {
          // Return to origin
          resetPosition(true);
        }
      },
    })
  ).current;

  // Opacities interpolate strictly from 0 to 1 so nothing is visible when pan == 0
  const rightOpacity = pan.interpolate({
    inputRange: [-ACTION_WIDTH, -15, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: 'clamp',
  });

  const leftOpacity = pan.interpolate({
    inputRange: [0, 15, ACTION_WIDTH],
    outputRange: [0, 0.4, 1],
    extrapolate: 'clamp',
  });

  const rightIconScale = pan.interpolate({
    inputRange: [-FULL_SWIPE_THRESHOLD, -ACTION_WIDTH, 0],
    outputRange: [1.2, 1, 0.8],
    extrapolate: 'clamp',
  });

  const leftIconScale = pan.interpolate({
    inputRange: [0, ACTION_WIDTH, FULL_SWIPE_THRESHOLD],
    outputRange: [0.8, 1, 1.2],
    extrapolate: 'clamp',
  });

  const handleCardPress = () => {
    if (isOpen) {
      resetPosition(true);
    } else {
      onPress();
    }
  };

  return (
    <View style={styles.container}>
      {/* Background Actions Layer - 100% invisible when idle */}
      <View style={styles.actionsContainer} pointerEvents={isOpen ? 'auto' : 'box-none'}>
        {/* Left Swipe Action (Categorize) */}
        {onCategorize && (
          <Animated.View
            style={[
              styles.actionButton,
              styles.categoryAction,
              { opacity: leftOpacity },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                resetPosition(true);
                onCategorize();
              }}
              style={styles.actionTouchable}
            >
              <Animated.View style={{ transform: [{ scale: leftIconScale }] }}>
                <Tag size={22} color="#ffffff" strokeWidth={2.4} />
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Right Swipe Action (Delete) */}
        <Animated.View
          style={[
            styles.actionButton,
            styles.deleteAction,
            { opacity: rightOpacity },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
              resetPosition(true);
              onDelete();
            }}
            style={styles.actionTouchable}
          >
            <Animated.View style={{ transform: [{ scale: rightIconScale }] }}>
              <Trash2 size={22} color="#ffffff" strokeWidth={2.4} />
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </View>

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
  actionsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionButton: {
    width: ACTION_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTouchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryAction: {
    backgroundColor: '#10B981',
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    marginLeft: 'auto',
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
});
