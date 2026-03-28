export type ThemePreference = 'dark' | 'light' | 'system';

export interface Preferences {
  theme: ThemePreference;
  terminalFontSize: number;
  terminalFontFamily: string;
  uiScale: number;
}

export type PreferenceKey = keyof Preferences;

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  terminalFontSize: 14,
  terminalFontFamily: 'JetBrains Mono',
  uiScale: 100,
};

export const TERMINAL_FONT_SIZE_RANGE = {
  min: 10,
  max: 24,
  step: 1,
} as const;

export const UI_SCALE_RANGE = {
  min: 80,
  max: 125,
  step: 5,
} as const;

export const TERMINAL_FONT_FAMILY_OPTIONS = [
  'JetBrains Mono',
  'Fira Code',
  'IBM Plex Mono',
  'Cascadia Mono',
] as const;

export interface GetPreferencesResponse {
  preferences: Preferences;
}

export type SetPreferenceRequest = {
  [Key in PreferenceKey]: {
    key: Key;
    value: Preferences[Key];
  };
}[PreferenceKey];
