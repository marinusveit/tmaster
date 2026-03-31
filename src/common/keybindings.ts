import {
  DEFAULT_KEYBINDINGS,
  KEYBINDING_DEFINITIONS,
  type CustomKeybindingMap,
  type KeybindingAction,
  type KeybindingDefinition,
  type KeybindingMap,
} from '../shared/types/keybindings';

type ShortcutModifier = 'Mod' | 'Ctrl' | 'Meta' | 'Alt' | 'Shift';

interface KeyboardShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

interface ParsedShortcut {
  modifiers: Set<ShortcutModifier>;
  key: string;
}

const MODIFIER_ORDER: readonly ShortcutModifier[] = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'];
const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift']);

const SPECIAL_KEY_ALIASES: Readonly<Record<string, string>> = {
  Escape: 'Escape',
  Esc: 'Escape',
  Tab: 'Tab',
  Space: 'Space',
  ' ': 'Space',
  Enter: 'Enter',
  Period: '.',
  '.': '.',
  Slash: '/',
  '/': '/',
  Backslash: '\\',
  '\\': '\\',
};

const FUNCTION_KEY_PATTERN = /^F\d{1,2}$/i;

const normalizeModifierToken = (token: string): ShortcutModifier | null => {
  switch (token.trim().toLowerCase()) {
    case 'mod':
      return 'Mod';
    case 'ctrl':
    case 'control':
      return 'Ctrl';
    case 'meta':
    case 'cmd':
    case 'command':
      return 'Meta';
    case 'alt':
    case 'option':
      return 'Alt';
    case 'shift':
      return 'Shift';
    default:
      return null;
  }
};

const normalizeShortcutKey = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed in SPECIAL_KEY_ALIASES) {
    return SPECIAL_KEY_ALIASES[trimmed] ?? null;
  }

  if (FUNCTION_KEY_PATTERN.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (trimmed.length === 1) {
    return trimmed.toUpperCase();
  }

  return trimmed;
};

const parseShortcut = (shortcut: string): ParsedShortcut | null => {
  const tokens = shortcut
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  const keyToken = tokens[tokens.length - 1];
  if (!keyToken) {
    return null;
  }

  const normalizedKey = normalizeShortcutKey(keyToken);
  if (!normalizedKey) {
    return null;
  }

  const modifiers = new Set<ShortcutModifier>();
  for (const token of tokens.slice(0, -1)) {
    const normalizedModifier = normalizeModifierToken(token);
    if (!normalizedModifier) {
      return null;
    }

    modifiers.add(normalizedModifier);
  }

  return {
    modifiers,
    key: normalizedKey,
  };
};

export const normalizeShortcut = (shortcut: string): string | null => {
  const parsedShortcut = parseShortcut(shortcut);
  if (!parsedShortcut) {
    return null;
  }

  const modifiers = new Set(parsedShortcut.modifiers);
  if (modifiers.has('Ctrl') !== modifiers.has('Meta')) {
    modifiers.delete('Ctrl');
    modifiers.delete('Meta');
    modifiers.add('Mod');
  }

  if (
    !modifiers.has('Mod')
    && !modifiers.has('Ctrl')
    && !modifiers.has('Meta')
    && !modifiers.has('Alt')
  ) {
    return null;
  }

  const orderedModifiers = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
  return [...orderedModifiers, parsedShortcut.key].join('+');
};

export const serializeKeyboardShortcut = (event: KeyboardShortcutEvent): string | null => {
  if (MODIFIER_KEYS.has(event.key)) {
    return null;
  }

  const normalizedKey = normalizeShortcutKey(event.key);
  if (!normalizedKey) {
    return null;
  }

  const modifiers: ShortcutModifier[] = [];
  if (event.ctrlKey && event.metaKey) {
    modifiers.push('Ctrl', 'Meta');
  } else if (event.ctrlKey || event.metaKey) {
    modifiers.push('Mod');
  }

  if (event.altKey) {
    modifiers.push('Alt');
  }

  if (event.shiftKey) {
    modifiers.push('Shift');
  }

  if (modifiers.length === 0 || (modifiers.length === 1 && modifiers[0] === 'Shift')) {
    return null;
  }

  return [...modifiers, normalizedKey].join('+');
};

export const buildEffectiveKeybindings = (customKeybindings: CustomKeybindingMap): KeybindingMap => {
  return {
    ...DEFAULT_KEYBINDINGS,
    ...customKeybindings,
  };
};

export const matchShortcut = (event: KeyboardShortcutEvent, shortcut: string): boolean => {
  const parsedShortcut = parseShortcut(shortcut);
  if (!parsedShortcut) {
    return false;
  }

  const normalizedKey = normalizeShortcutKey(event.key);
  if (!normalizedKey || parsedShortcut.key !== normalizedKey) {
    return false;
  }

  const wantsMod = parsedShortcut.modifiers.has('Mod');
  const expectsCtrl = parsedShortcut.modifiers.has('Ctrl');
  const expectsMeta = parsedShortcut.modifiers.has('Meta');
  const expectsAlt = parsedShortcut.modifiers.has('Alt');
  const expectsShift = parsedShortcut.modifiers.has('Shift');

  const ctrlMatches = wantsMod ? (event.ctrlKey || event.metaKey) : event.ctrlKey === expectsCtrl;
  const metaMatches = wantsMod ? true : event.metaKey === expectsMeta;

  return ctrlMatches
    && metaMatches
    && event.altKey === expectsAlt
    && event.shiftKey === expectsShift
    && (wantsMod || (!event.ctrlKey && !event.metaKey) || expectsCtrl || expectsMeta);
};

export const findMatchingKeybindingAction = (
  event: KeyboardShortcutEvent,
  keybindings: KeybindingMap,
): KeybindingAction | null => {
  for (const definition of KEYBINDING_DEFINITIONS) {
    if (matchShortcut(event, keybindings[definition.action])) {
      return definition.action;
    }
  }

  return null;
};

export const findConflictingKeybindingAction = (
  action: KeybindingAction,
  shortcut: string,
  keybindings: KeybindingMap,
): KeybindingAction | null => {
  const normalizedShortcut = normalizeShortcut(shortcut);
  if (!normalizedShortcut) {
    return null;
  }

  for (const definition of KEYBINDING_DEFINITIONS) {
    if (definition.action === action) {
      continue;
    }

    const candidate = normalizeShortcut(keybindings[definition.action]);
    if (candidate === normalizedShortcut) {
      return definition.action;
    }
  }

  return null;
};

export const getKeybindingDefinition = (
  action: KeybindingAction,
): KeybindingDefinition => {
  const definition = KEYBINDING_DEFINITIONS.find((entry) => entry.action === action);
  if (!definition) {
    throw new Error(`Unknown keybinding action: ${action}`);
  }

  return definition;
};

export const formatShortcutForDisplay = (shortcut: string): string => {
  return shortcut.replace(/\bMod\b/g, 'Ctrl/Cmd');
};
