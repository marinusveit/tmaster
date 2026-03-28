import { useEffect } from 'react';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import {
  applyPreferencesToDocument,
  subscribeToSystemThemeChanges,
} from '@renderer/utils/appearance';

export const usePreferences = (): void => {
  const loadPreferences = useSettingsStore((state) => state.loadPreferences);
  const preferences = useSettingsStore((state) => state.preferences);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    applyPreferencesToDocument(preferences);
  }, [preferences]);

  useEffect(() => {
    if (preferences.theme !== 'system') {
      return;
    }

    return subscribeToSystemThemeChanges(() => {
      applyPreferencesToDocument(useSettingsStore.getState().preferences);
    });
  }, [preferences.theme]);
};
