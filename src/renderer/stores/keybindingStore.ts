import { create } from 'zustand';
import { transport } from '@renderer/transport';
import {
  DEFAULT_KEYBINDINGS,
  type CustomKeybindingMap,
  type GetKeybindingsResponse,
  type KeybindingAction,
  type KeybindingMap,
  type ResetKeybindingRequest,
  type SetKeybindingRequest,
} from '@shared/types/keybindings';

interface KeybindingStoreState {
  keybindings: KeybindingMap;
  customKeybindings: CustomKeybindingMap;
  isHydrated: boolean;
  isSaving: boolean;
  errorMessage: string | null;
}

interface KeybindingStoreActions {
  loadKeybindings: () => Promise<void>;
  updateKeybinding: (action: KeybindingAction, shortcut: string) => Promise<void>;
  resetKeybinding: (action: KeybindingAction) => Promise<void>;
  clearError: () => void;
}

export type KeybindingStore = KeybindingStoreState & KeybindingStoreActions;

const applyResponse = (
  response: GetKeybindingsResponse,
): Pick<KeybindingStoreState, 'keybindings' | 'customKeybindings' | 'isHydrated' | 'isSaving' | 'errorMessage'> => ({
  keybindings: response.keybindings,
  customKeybindings: response.customKeybindings,
  isHydrated: true,
  isSaving: false,
  errorMessage: null,
});

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : 'Failed to update keybindings';
};

export const useKeybindingStore = create<KeybindingStore>((set, get) => ({
  keybindings: { ...DEFAULT_KEYBINDINGS },
  customKeybindings: {},
  isHydrated: false,
  isSaving: false,
  errorMessage: null,

  loadKeybindings: async () => {
    const response = await transport.invoke<GetKeybindingsResponse>('getKeybindings');
    set(applyResponse(response));
  },

  updateKeybinding: async (action, shortcut) => {
    const previousState = get();
    set({
      keybindings: {
        ...previousState.keybindings,
        [action]: shortcut,
      },
      customKeybindings: {
        ...previousState.customKeybindings,
        [action]: shortcut,
      },
      isSaving: true,
      errorMessage: null,
    });

    try {
      const response = await transport.invoke<GetKeybindingsResponse>(
        'setKeybinding',
        { action, shortcut } as SetKeybindingRequest,
      );
      set(applyResponse(response));
    } catch (error: unknown) {
      set({
        keybindings: previousState.keybindings,
        customKeybindings: previousState.customKeybindings,
        isSaving: false,
        errorMessage: getErrorMessage(error),
      });
      throw error;
    }
  },

  resetKeybinding: async (action) => {
    const previousState = get();
    const remainingCustomKeybindings = { ...previousState.customKeybindings };
    delete remainingCustomKeybindings[action];

    set({
      keybindings: {
        ...previousState.keybindings,
        [action]: DEFAULT_KEYBINDINGS[action],
      },
      customKeybindings: remainingCustomKeybindings,
      isSaving: true,
      errorMessage: null,
    });

    try {
      const response = await transport.invoke<GetKeybindingsResponse>(
        'resetKeybinding',
        { action } as ResetKeybindingRequest,
      );
      set(applyResponse(response));
    } catch (error: unknown) {
      set({
        keybindings: previousState.keybindings,
        customKeybindings: previousState.customKeybindings,
        isSaving: false,
        errorMessage: getErrorMessage(error),
      });
      throw error;
    }
  },

  clearError: () => {
    set({ errorMessage: null });
  },
}));
