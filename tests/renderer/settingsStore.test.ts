const mocks = vi.hoisted(() => ({
  transportInvoke: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@renderer/stores/settingsStore';

vi.mock('@renderer/transport', () => ({
  transport: {
    invoke: mocks.transportInvoke,
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  },
}));

describe('settingsStore', () => {
  beforeEach(() => {
    mocks.transportInvoke.mockReset();
    useSettingsStore.setState({
      preferences: {
        theme: 'dark',
        terminalFontSize: 14,
        terminalFontFamily: 'JetBrains Mono',
        uiScale: 100,
      },
      isHydrated: false,
      isSaving: false,
      isPanelOpen: false,
    });
  });

  it('laedt Preferences ueber den Transport', async () => {
    mocks.transportInvoke.mockResolvedValue({
      preferences: {
        theme: 'light',
        terminalFontSize: 16,
        terminalFontFamily: 'Fira Code',
        uiScale: 110,
      },
    });

    await useSettingsStore.getState().loadPreferences();

    expect(mocks.transportInvoke).toHaveBeenCalledWith('getPreferences');
    expect(useSettingsStore.getState().preferences).toEqual({
      theme: 'light',
      terminalFontSize: 16,
      terminalFontFamily: 'Fira Code',
      uiScale: 110,
    });
    expect(useSettingsStore.getState().isHydrated).toBe(true);
  });

  it('updated Preferences optimistisch und bestaetigt den Rueckkanal', async () => {
    mocks.transportInvoke.mockResolvedValue({
      preferences: {
        theme: 'dark',
        terminalFontSize: 18,
        terminalFontFamily: 'JetBrains Mono',
        uiScale: 100,
      },
    });

    await useSettingsStore.getState().updatePreference('terminalFontSize', 18);

    expect(mocks.transportInvoke).toHaveBeenCalledWith('setPreference', {
      key: 'terminalFontSize',
      value: 18,
    });
    expect(useSettingsStore.getState().preferences.terminalFontSize).toBe(18);
    expect(useSettingsStore.getState().isSaving).toBe(false);
  });

  it('setzt bei Fehlern auf den alten Zustand zurueck', async () => {
    mocks.transportInvoke.mockRejectedValue(new Error('db unavailable'));

    await expect(
      useSettingsStore.getState().updatePreference('uiScale', 105),
    ).rejects.toThrow('db unavailable');

    expect(useSettingsStore.getState().preferences.uiScale).toBe(100);
    expect(useSettingsStore.getState().isSaving).toBe(false);
  });
});
