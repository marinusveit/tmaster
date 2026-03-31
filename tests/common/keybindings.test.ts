import { describe, expect, it } from 'vitest';
import {
  buildEffectiveKeybindings,
  findConflictingKeybindingAction,
  findMatchingKeybindingAction,
  formatShortcutForDisplay,
  normalizeShortcut,
  serializeKeyboardShortcut,
} from '../../src/common/keybindings';

describe('common keybinding helpers', () => {
  it('normalisiert Shortcut-Strings in kanonische Form', () => {
    expect(normalizeShortcut('ctrl+shift+t')).toBe('Mod+Shift+T');
    expect(normalizeShortcut('meta+alt+p')).toBe('Mod+Alt+P');
    expect(normalizeShortcut('shift+t')).toBeNull();
  });

  it('serialisiert Tastaturevents mit Modifikatoren', () => {
    expect(serializeKeyboardShortcut({
      key: 'n',
      ctrlKey: true,
      metaKey: false,
      altKey: true,
      shiftKey: false,
    })).toBe('Mod+Alt+N');

    expect(serializeKeyboardShortcut({
      key: 'Shift',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    })).toBeNull();
  });

  it('findet die passende Action für ein Event', () => {
    const keybindings = buildEffectiveKeybindings({
      createTerminal: 'Mod+Alt+N',
    });

    expect(findMatchingKeybindingAction({
      key: 'n',
      ctrlKey: true,
      metaKey: false,
      altKey: true,
      shiftKey: false,
    }, keybindings)).toBe('createTerminal');

    expect(findMatchingKeybindingAction({
      key: 't',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    }, keybindings)).toBeNull();
  });

  it('erkennt Konflikte zwischen effektiven Bindings', () => {
    const keybindings = buildEffectiveKeybindings({
      toggleAssistant: 'Mod+Shift+T',
    });

    expect(findConflictingKeybindingAction('toggleAssistant', 'Mod+Shift+T', keybindings)).toBe('createTerminal');
  });

  it('formatiert Mod für die Anzeige benutzerfreundlich', () => {
    expect(formatShortcutForDisplay('Mod+Shift+T')).toBe('Ctrl/Cmd+Shift+T');
  });
});
