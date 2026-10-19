import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useGlassTabBarMetrics() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const height = 72 + Math.max(0, Math.min(fontScale, 1.5) - 1) * 20;
  const bottom = Math.max(insets.bottom, 12) + 8;
  return {
    height,
    bottom,
    left: Math.max(insets.left, 16),
    right: Math.max(insets.right, 16),
    clearance: height + bottom + 16,
  };
}
