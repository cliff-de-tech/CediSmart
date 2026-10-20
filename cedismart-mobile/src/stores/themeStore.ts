import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type Theme = 'light' | 'dark';
export type ThemeMode = 'none' | 'dark' | 'system';

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
      themeMode: 'none',
      theme: 'light',
      setThemeMode: (mode: ThemeMode) => {
        let activeTheme: Theme = 'light';
        if (mode === 'dark') {
          activeTheme = 'dark';
        } else if (mode === 'system') {
          activeTheme = getSystemTheme();
        } else {
          activeTheme = 'light';
        }
        set({ themeMode: mode, theme: activeTheme });
      },
      setTheme: (theme: Theme) => {
        const mode: ThemeMode = theme === 'dark' ? 'dark' : 'none';
        set({
          theme,
          themeMode: mode,
        });
      },
      toggleTheme: () => {
        const currentMode = get().themeMode;
        const nextMode: ThemeMode = currentMode === 'dark' ? 'none' : 'dark';
        const activeTheme: Theme = nextMode === 'dark' ? 'dark' : 'light';
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
          const mode: ThemeMode = state.themeMode ?? 'none';
          state.themeMode = mode;
          if (mode === 'dark') {
            state.theme = 'dark';
          } else if (mode === 'system') {
            state.theme = getSystemTheme();
          } else {
            state.theme = 'light';
          }
        }
      },
    }
  )
);

// Listen for device appearance changes in real time (only when user has selected Device Theme)
Appearance.addChangeListener(({ colorScheme }) => {
  const currentMode = useThemeStore.getState().themeMode;
  if (currentMode === 'system') {
    const nextTheme: Theme = colorScheme === 'dark' ? 'dark' : 'light';
    if (useThemeStore.getState().theme !== nextTheme) {
      useThemeStore.setState({ theme: nextTheme });
    }
  }
});
