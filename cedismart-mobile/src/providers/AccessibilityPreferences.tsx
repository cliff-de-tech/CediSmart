import React, { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';

const PreferencesContext = createContext({ reduceMotion: false, reduceTransparency: false });

export function AccessibilityPreferencesProvider({ children }: React.PropsWithChildren) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void AccessibilityInfo.isReduceMotionEnabled().then(value => {
        if (mounted) setReduceMotion(value);
      }).catch(() => {});
      if (Platform.OS === 'ios') {
        void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
          if (mounted) setReduceTransparency(value);
        }).catch(() => {});
      } else {
        setReduceTransparency(false);
      }
    };
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const transparencySubscription = Platform.OS === 'ios'
      ? AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency)
      : undefined;
    const appSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    refresh();
    return () => {
      mounted = false;
      motionSubscription.remove();
      transparencySubscription?.remove();
      appSubscription.remove();
    };
  }, []);

  return (
    <PreferencesContext.Provider value={{ reduceMotion, reduceTransparency }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export const useAccessibilityPreferences = () => useContext(PreferencesContext);
