import { useThemeStore } from '../stores/themeStore';

/**
 * Hook that returns isDark boolean and a color resolver for the current theme.
 * Usage:
 *   const { isDark, c } = useTheme();
 *   className={c('bg-background', 'bg-dark-background')}
 */
export function useTheme() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  /** Pick between light and dark class strings */
  const c = (light: string, dark: string) => (isDark ? dark : light);

  return { isDark, theme, c };
}

/** Common icon colors for the active theme */
export function useIconColors() {
  const { isDark } = useTheme();
  return {
    primary: isDark ? '#e1e3e0' : '#1c1b1f',
    secondary: isDark ? '#b2b6b1' : '#40493d',
    muted: isDark ? '#434942' : '#D1D5DB',
    accent: isDark ? '#2e7d32' : '#0d631b',
    error: '#ba1a1a',
  };
}
