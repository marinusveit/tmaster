export type KeybindingAction =
  | 'quickSwitcher'
  | 'openSearch'
  | 'createTerminal'
  | 'closeTerminal'
  | 'saveTerminalOutput'
  | 'nextWorkspace'
  | 'toggleSplit'
  | 'toggleAssistant';

export interface KeybindingDefinition {
  action: KeybindingAction;
  label: string;
  description: string;
  defaultShortcut: string;
}

export type KeybindingMap = Record<KeybindingAction, string>;
export type CustomKeybindingMap = Partial<Record<KeybindingAction, string>>;

export const KEYBINDING_DEFINITIONS: ReadonlyArray<KeybindingDefinition> = [
  {
    action: 'quickSwitcher',
    label: 'Quick Switcher',
    description: 'Opens the command palette for terminals and workspaces.',
    defaultShortcut: 'Mod+K',
  },
  {
    action: 'openSearch',
    label: 'Search in Terminal',
    description: 'Shows search for the active terminal.',
    defaultShortcut: 'Mod+F',
  },
  {
    action: 'createTerminal',
    label: 'Create Terminal',
    description: 'Creates a new terminal in the current workspace.',
    defaultShortcut: 'Mod+Shift+T',
  },
  {
    action: 'closeTerminal',
    label: 'Close Terminal',
    description: 'Closes the active terminal.',
    defaultShortcut: 'Mod+Shift+W',
  },
  {
    action: 'saveTerminalOutput',
    label: 'Save Terminal Output',
    description: 'Exports the active terminal buffer to a file.',
    defaultShortcut: 'Mod+Shift+S',
  },
  {
    action: 'nextWorkspace',
    label: 'Next Workspace',
    description: 'Switches to the next workspace tab.',
    defaultShortcut: 'Mod+Tab',
  },
  {
    action: 'toggleSplit',
    label: 'Toggle Split Layout',
    description: 'Cycles through the available split modes.',
    defaultShortcut: 'Mod+\\',
  },
  {
    action: 'toggleAssistant',
    label: 'Toggle Assistant',
    description: 'Opens or closes the assistant drawer.',
    defaultShortcut: 'Mod+.',
  },
] as const;

export const KEYBINDING_ACTIONS = KEYBINDING_DEFINITIONS.map(
  (definition) => definition.action,
) as ReadonlyArray<KeybindingAction>;

export const DEFAULT_KEYBINDINGS = KEYBINDING_DEFINITIONS.reduce<KeybindingMap>(
  (bindings, definition) => ({
    ...bindings,
    [definition.action]: definition.defaultShortcut,
  }),
  {} as KeybindingMap,
);

export interface GetKeybindingsResponse {
  keybindings: KeybindingMap;
  customKeybindings: CustomKeybindingMap;
}

export interface SetKeybindingRequest {
  action: KeybindingAction;
  shortcut: string;
}

export interface ResetKeybindingRequest {
  action: KeybindingAction;
}
