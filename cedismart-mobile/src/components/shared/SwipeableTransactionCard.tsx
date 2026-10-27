import React, { useRef } from 'react';
import {
  View,
  Animated,
  PanResponder,
  TouchableOpacity,
  Text,
  StyleSheet,
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

const SWIPE_THRESHOLD = 75;

export const SwipeableTransactionCard: React.FC<SwipeableTransactionCardProps> = ({
  onDelete,
  onCategorize,
  onPress,
  children,
  isDark = true,
}) => {
  const pan = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dy) < 12;
      },
      onPanResponderMove: (_, gestureState) => {
        // Allow resistance when swiping further
        let dx = gestureState.dx;
        if (dx > 100) dx = 100 + (dx - 100) * 0.2;
        if (dx < -100) dx = -100 + (dx + 100) * 0.2;
        pan.setValue(dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swiped Left -> Delete
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          Animated.timing(pan, {
            toValue: -120,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
            // Reset position after action
            Animated.spring(pan, {
              toValue: 0,
              bounciness: 4,
              useNativeDriver: true,
            }).start();
          });
        } else if (gestureState.dx > SWIPE_THRESHOLD && onCategorize) {
          // Swiped Right -> Categorize
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          Animated.timing(pan, {
            toValue: 120,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            onCategorize();
            Animated.spring(pan, {
              toValue: 0,
              bounciness: 4,
              useNativeDriver: true,
            }).start();
          });
        } else {
          // Return to origin
          Animated.spring(pan, {
            toValue: 0,
            bounciness: 8,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      {/* Background Actions */}
      <View style={styles.actionsContainer}>
        {/* Right Swipe Action (Categorize) */}
        {onCategorize && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onCategorize();
            }}
            style={[styles.leftAction, { backgroundColor: '#059669' }]}
          >
            <Tag size={18} color="#ffffff" />
            <Text style={styles.actionText}>Category</Text>
          </TouchableOpacity>
        )}

        {/* Left Swipe Action (Delete) */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onDelete();
          }}
          style={[styles.rightAction, { backgroundColor: '#dc2626' }]}
        >
          <Trash2 size={18} color="#ffffff" />
          <Text style={styles.actionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Swiping Foreground Card */}
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          transform: [{ translateX: pan }],
        }}
      >
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
  },
  leftAction: {
    width: 80,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  rightAction: {
    width: 80,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginLeft: 'auto',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
