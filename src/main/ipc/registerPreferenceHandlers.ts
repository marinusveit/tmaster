import type { IpcMain } from 'electron';
import type BetterSqlite3 from 'better-sqlite3';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  DEFAULT_PREFERENCES,
  TERMINAL_FONT_FAMILY_OPTIONS,
  TERMINAL_FONT_SIZE_RANGE,
  UI_SCALE_RANGE,
  type GetPreferencesResponse,
  type PreferenceKey,
  type Preferences,
  type SetPreferenceRequest,
  type ThemePreference,
} from '../../shared/types/preferences';
import { listPreferences, upsertPreference } from '../db/queries';

const THEME_OPTIONS: readonly ThemePreference[] = ['dark', 'light', 'system'];

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isPreferenceKey = (value: unknown): value is PreferenceKey => {
  return typeof value === 'string' && value in DEFAULT_PREFERENCES;
};

const isSupportedTerminalFontFamily = (value: string): boolean => {
  return TERMINAL_FONT_FAMILY_OPTIONS.some((option) => option === value);
};

const readStoredPreferences = (db: BetterSqlite3.Database): Preferences => {
  const preferences: Preferences = { ...DEFAULT_PREFERENCES };

  for (const row of listPreferences(db)) {
    switch (row.key) {
      case 'theme':
        if (THEME_OPTIONS.includes(row.value as ThemePreference)) {
          preferences.theme = row.value as ThemePreference;
        }
        break;
      case 'terminalFontSize': {
        const parsed = Number.parseInt(row.value, 10);
        if (
          Number.isInteger(parsed)
          && parsed >= TERMINAL_FONT_SIZE_RANGE.min
          && parsed <= TERMINAL_FONT_SIZE_RANGE.max
        ) {
          preferences.terminalFontSize = parsed;
        }
        break;
      }
      case 'terminalFontFamily':
        if (isSupportedTerminalFontFamily(row.value)) {
          preferences.terminalFontFamily = row.value;
        }
        break;
      case 'uiScale': {
        const parsed = Number.parseInt(row.value, 10);
        if (Number.isInteger(parsed) && parsed >= UI_SCALE_RANGE.min && parsed <= UI_SCALE_RANGE.max) {
          preferences.uiScale = parsed;
        }
        break;
      }
      default:
        break;
    }
  }

  return preferences;
};

const parsePreferenceUpdate = (payload: unknown): SetPreferenceRequest => {
  if (!isObject(payload) || !isPreferenceKey(payload.key)) {
    throw new Error('Invalid preference update payload');
  }

  switch (payload.key) {
    case 'theme':
      if (typeof payload.value !== 'string' || !THEME_OPTIONS.includes(payload.value as ThemePreference)) {
        throw new Error('Invalid theme preference');
      }
      return { key: 'theme', value: payload.value as ThemePreference };
    case 'terminalFontSize':
      if (
        typeof payload.value !== 'number'
        || !Number.isInteger(payload.value)
        || payload.value < TERMINAL_FONT_SIZE_RANGE.min
        || payload.value > TERMINAL_FONT_SIZE_RANGE.max
      ) {
        throw new Error('Invalid terminal font size');
      }
      return { key: 'terminalFontSize', value: payload.value };
    case 'terminalFontFamily':
      if (
        typeof payload.value !== 'string'
        || !isSupportedTerminalFontFamily(payload.value)
      ) {
        throw new Error('Invalid terminal font family');
      }
      return { key: 'terminalFontFamily', value: payload.value };
    case 'uiScale':
      if (
        typeof payload.value !== 'number'
        || !Number.isInteger(payload.value)
        || payload.value < UI_SCALE_RANGE.min
        || payload.value > UI_SCALE_RANGE.max
      ) {
        throw new Error('Invalid UI scale');
      }
      return { key: 'uiScale', value: payload.value };
    default:
      throw new Error('Unsupported preference key');
  }
};

const serializePreferenceValue = (request: SetPreferenceRequest): string => {
  return String(request.value);
};

const toResponse = (db: BetterSqlite3.Database): GetPreferencesResponse => {
  return {
    preferences: readStoredPreferences(db),
  };
};

export const registerPreferenceHandlers = (
  ipcMain: IpcMain,
  db: BetterSqlite3.Database,
): void => {
  ipcMain.handle(IPC_CHANNELS.preferencesGet, () => {
    return toResponse(db);
  });

  ipcMain.handle(IPC_CHANNELS.preferencesSet, (_event, payload: unknown) => {
    const request = parsePreferenceUpdate(payload);
    upsertPreference(db, request.key, serializePreferenceValue(request), Date.now());
    return toResponse(db);
  });
};
