import {
  type Preferences,
  type ThemePreference,
} from '@shared/types/preferences';
import { refreshTerminalAppearance } from '@renderer/components/terminal/terminalInstances';

export type EffectiveTheme = Exclude<ThemePreference, 'system'>;

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

export const getSystemTheme = (): EffectiveTheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light';
};

export const resolveEffectiveTheme = (theme: ThemePreference): EffectiveTheme => {
  if (theme === 'system') {
    return getSystemTheme();
  }

  return theme;
};

export const applyPreferencesToDocument = (preferences: Preferences): void => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = resolveEffectiveTheme(preferences.theme);
  root.style.setProperty('--terminal-font-family', preferences.terminalFontFamily);
  root.style.setProperty('--terminal-font-size', String(preferences.terminalFontSize));
  root.style.setProperty('--ui-scale', String(preferences.uiScale / 100));
  refreshTerminalAppearance();
};

export const subscribeToSystemThemeChanges = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
  const handleChange = (): void => {
    listener();
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }

  mediaQuery.addListener(handleChange);
  return () => {
    mediaQuery.removeListener(handleChange);
  };
};
