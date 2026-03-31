const mocks = vi.hoisted(() => ({
  transportInvoke: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeybindingStore } from '@renderer/stores/keybindingStore';

vi.mock('@renderer/transport', () => ({
  transport: {
    invoke: mocks.transportInvoke,
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  },
}));

describe('keybindingStore', () => {
  beforeEach(() => {
    mocks.transportInvoke.mockReset();
    useKeybindingStore.setState({
      keybindings: {
        quickSwitcher: 'Mod+K',
        openSearch: 'Mod+F',
        createTerminal: 'Mod+Shift+T',
        closeTerminal: 'Mod+Shift+W',
        saveTerminalOutput: 'Mod+Shift+S',
        nextWorkspace: 'Mod+Tab',
        toggleSplit: 'Mod+\\',
        toggleAssistant: 'Mod+.',
      },
      customKeybindings: {},
      isHydrated: false,
      isSaving: false,
      errorMessage: null,
    });
  });

  it('lädt Keybindings über den Transport', async () => {
    mocks.transportInvoke.mockResolvedValue({
      keybindings: {
        quickSwitcher: 'Mod+P',
        openSearch: 'Mod+F',
        createTerminal: 'Mod+Shift+T',
        closeTerminal: 'Mod+Shift+W',
        saveTerminalOutput: 'Mod+Shift+S',
        nextWorkspace: 'Mod+Tab',
        toggleSplit: 'Mod+\\',
        toggleAssistant: 'Mod+.',
      },
      customKeybindings: {
        quickSwitcher: 'Mod+P',
      },
    });

    await useKeybindingStore.getState().loadKeybindings();

    expect(mocks.transportInvoke).toHaveBeenCalledWith('getKeybindings');
    expect(useKeybindingStore.getState().keybindings.quickSwitcher).toBe('Mod+P');
    expect(useKeybindingStore.getState().customKeybindings.quickSwitcher).toBe('Mod+P');
    expect(useKeybindingStore.getState().isHydrated).toBe(true);
  });

  it('updated Keybindings optimistisch und bestätigt den Rückkanal', async () => {
    mocks.transportInvoke.mockResolvedValue({
      keybindings: {
        quickSwitcher: 'Mod+K',
        openSearch: 'Mod+F',
        createTerminal: 'Mod+Alt+N',
        closeTerminal: 'Mod+Shift+W',
        saveTerminalOutput: 'Mod+Shift+S',
        nextWorkspace: 'Mod+Tab',
        toggleSplit: 'Mod+\\',
        toggleAssistant: 'Mod+.',
      },
      customKeybindings: {
        createTerminal: 'Mod+Alt+N',
      },
    });

    await useKeybindingStore.getState().updateKeybinding('createTerminal', 'Mod+Alt+N');

    expect(mocks.transportInvoke).toHaveBeenCalledWith('setKeybinding', {
      action: 'createTerminal',
      shortcut: 'Mod+Alt+N',
    });
    expect(useKeybindingStore.getState().keybindings.createTerminal).toBe('Mod+Alt+N');
    expect(useKeybindingStore.getState().customKeybindings.createTerminal).toBe('Mod+Alt+N');
    expect(useKeybindingStore.getState().isSaving).toBe(false);
  });

  it('setzt bei Reset den Default wieder ein', async () => {
    useKeybindingStore.setState((state) => ({
      ...state,
      keybindings: {
        ...state.keybindings,
        createTerminal: 'Mod+Alt+N',
      },
      customKeybindings: {
        createTerminal: 'Mod+Alt+N',
      },
    }));

    mocks.transportInvoke.mockResolvedValue({
      keybindings: {
        quickSwitcher: 'Mod+K',
        openSearch: 'Mod+F',
        createTerminal: 'Mod+Shift+T',
        closeTerminal: 'Mod+Shift+W',
        saveTerminalOutput: 'Mod+Shift+S',
        nextWorkspace: 'Mod+Tab',
        toggleSplit: 'Mod+\\',
        toggleAssistant: 'Mod+.',
      },
      customKeybindings: {},
    });

    await useKeybindingStore.getState().resetKeybinding('createTerminal');

    expect(mocks.transportInvoke).toHaveBeenCalledWith('resetKeybinding', {
      action: 'createTerminal',
    });
    expect(useKeybindingStore.getState().keybindings.createTerminal).toBe('Mod+Shift+T');
    expect(useKeybindingStore.getState().customKeybindings.createTerminal).toBeUndefined();
  });

  it('stellt bei Fehlern den alten Zustand wieder her', async () => {
    mocks.transportInvoke.mockRejectedValue(new Error('duplicate shortcut'));

    await expect(
      useKeybindingStore.getState().updateKeybinding('toggleAssistant', 'Mod+Shift+T'),
    ).rejects.toThrow('duplicate shortcut');

    expect(useKeybindingStore.getState().keybindings.toggleAssistant).toBe('Mod+.');
    expect(useKeybindingStore.getState().errorMessage).toBe('duplicate shortcut');
    expect(useKeybindingStore.getState().isSaving).toBe(false);
  });
});
