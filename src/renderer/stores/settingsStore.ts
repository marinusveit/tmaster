import { create } from 'zustand';
import { transport } from '@renderer/transport';
import {
  DEFAULT_PREFERENCES,
  type GetPreferencesResponse,
  type Preferences,
  type PreferenceKey,
  type SetPreferenceRequest,
} from '@shared/types/preferences';

interface SettingsStoreState {
  preferences: Preferences;
  isHydrated: boolean;
  isSaving: boolean;
  isPanelOpen: boolean;
}

interface SettingsStoreActions {
  loadPreferences: () => Promise<void>;
  updatePreference: <Key extends PreferenceKey>(key: Key, value: Preferences[Key]) => Promise<void>;
  setPanelOpen: (isOpen: boolean) => void;
  togglePanel: () => void;
}

export type SettingsStore = SettingsStoreState & SettingsStoreActions;

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  preferences: { ...DEFAULT_PREFERENCES },
  isHydrated: false,
  isSaving: false,
  isPanelOpen: false,

  loadPreferences: async () => {
    const response = await transport.invoke<GetPreferencesResponse>('getPreferences');
    set({
      preferences: response.preferences,
      isHydrated: true,
    });
  },

  updatePreference: async (key, value) => {
    const previousPreferences = get().preferences;
    const nextPreferences = {
      ...previousPreferences,
      [key]: value,
    } as Preferences;

    set({
      preferences: nextPreferences,
      isSaving: true,
    });

    try {
      const response = await transport.invoke<GetPreferencesResponse>(
        'setPreference',
        { key, value } as SetPreferenceRequest,
      );

      set({
        preferences: response.preferences,
        isSaving: false,
        isHydrated: true,
      });
    } catch (error: unknown) {
      set({
        preferences: previousPreferences,
        isSaving: false,
      });
      throw error;
    }
  },

  setPanelOpen: (isOpen) => {
    set({ isPanelOpen: isOpen });
  },

  togglePanel: () => {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }));
  },
}));
