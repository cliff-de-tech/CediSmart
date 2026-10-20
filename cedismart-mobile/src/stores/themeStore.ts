import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type Theme = 'light' | 'dark';
export type ThemeMode = 'dark' | 'system';

interface ThemeStoreState {
  themeMode: ThemeMode;
  theme: Theme;
  setThemeMode: (mode: ThemeMode) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const getSystemTheme = (): Theme => {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
};

export const useThemeStore = create<ThemeStoreState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      theme: getSystemTheme(),
      setThemeMode: (mode: ThemeMode) => {
        const activeTheme = mode === 'dark' ? 'dark' : getSystemTheme();
        set({ themeMode: mode, theme: activeTheme });
      },
      setTheme: (theme: Theme) => {
        const mode: ThemeMode = theme === 'dark' ? 'dark' : 'system';
        set({
          theme,
          themeMode: mode,
        });
      },
      toggleTheme: () => {
        const currentMode = get().themeMode;
        const nextMode: ThemeMode = currentMode === 'dark' ? 'system' : 'dark';
        const activeTheme = nextMode === 'dark' ? 'dark' : getSystemTheme();
        set({
          themeMode: nextMode,
          theme: activeTheme,
        });
      },
    }),
    {
      name: 'cedismart-theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const mode: ThemeMode = state.themeMode || (state.theme === 'dark' ? 'dark' : 'system');
          state.themeMode = mode;
          state.theme = mode === 'dark' ? 'dark' : getSystemTheme();
        }
      },
    }
  )
);

// Listen for device appearance changes in real time
Appearance.addChangeListener(({ colorScheme }) => {
  const currentMode = useThemeStore.getState().themeMode;
  if (currentMode === 'system') {
    const nextTheme: Theme = colorScheme === 'dark' ? 'dark' : 'light';
    if (useThemeStore.getState().theme !== nextTheme) {
      useThemeStore.setState({ theme: nextTheme });
    }
  }
});
