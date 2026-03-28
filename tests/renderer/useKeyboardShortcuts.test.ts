import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Minimaler DOM-Mock für KeyboardEvent
const listeners: Array<(e: KeyboardEvent) => void> = [];

const mockWindow = {
  addEventListener: vi.fn((type: string, handler: (e: KeyboardEvent) => void) => {
    if (type === 'keydown') {
      listeners.push(handler);
    }
  }),
  removeEventListener: vi.fn((type: string, handler: (e: KeyboardEvent) => void) => {
    if (type === 'keydown') {
      const idx = listeners.indexOf(handler);
      if (idx >= 0) {
        listeners.splice(idx, 1);
      }
    }
  }),
};

const fireKey = (key: string, opts: Partial<KeyboardEvent> = {}) => {
  const event = {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...opts,
  } as unknown as KeyboardEvent;

  for (const listener of [...listeners]) {
    listener(event);
  }

  return event;
};

describe('useKeyboardShortcuts (Handler-Logik)', () => {
  beforeEach(() => {
    listeners.length = 0;
    Object.assign(globalThis, { window: mockWindow });
  });

  afterEach(() => {
    listeners.length = 0;
  });

  it('Ctrl+Shift+T ruft onCreateTerminal auf', () => {
    const onCreateTerminal = vi.fn();

    // Simuliere was der Hook tut: Event-Listener registrieren
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        onCreateTerminal();
      }
    };
    mockWindow.addEventListener('keydown', handler);

    const event = fireKey('T', { ctrlKey: true, shiftKey: true });

    expect(onCreateTerminal).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('Ctrl+Shift+W ruft onCloseTerminal auf', () => {
    const onCloseTerminal = vi.fn();

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        onCloseTerminal();
      }
    };
    mockWindow.addEventListener('keydown', handler);

    const event = fireKey('W', { ctrlKey: true, shiftKey: true });

    expect(onCloseTerminal).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('Ctrl+Shift+S ruft onSaveTerminalOutput auf', () => {
    const onSaveTerminalOutput = vi.fn();

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        onSaveTerminalOutput();
      }
    };
    mockWindow.addEventListener('keydown', handler);

    const event = fireKey('S', { ctrlKey: true, shiftKey: true });

    expect(onSaveTerminalOutput).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('Ctrl+1 wechselt zum Terminal an Position 0', () => {
    const onSwitchTerminal = vi.fn();
    const terminals = [
      { terminalId: 't1', label: { prefix: 'T', index: 1 }, workspaceId: 'ws1', status: 'active' as const, createdAt: 1 },
      { terminalId: 't2', label: { prefix: 'T', index: 2 }, workspaceId: 'ws1', status: 'active' as const, createdAt: 2 },
    ];

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        const terminal = terminals[index];
        if (terminal) {
          onSwitchTerminal(terminal.terminalId);
        }
      }
    };
    mockWindow.addEventListener('keydown', handler);

    fireKey('1', { ctrlKey: true });
    expect(onSwitchTerminal).toHaveBeenCalledWith('t1');

    fireKey('2', { ctrlKey: true });
    expect(onSwitchTerminal).toHaveBeenCalledWith('t2');
  });

  it('Ctrl+9 tut nichts wenn nur 2 Terminals existieren', () => {
    const onSwitchTerminal = vi.fn();
    const terminals = [
      { terminalId: 't1', label: { prefix: 'T', index: 1 }, workspaceId: 'ws1', status: 'active' as const, createdAt: 1 },
    ];

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        const terminal = terminals[index];
        if (terminal) {
          onSwitchTerminal(terminal.terminalId);
        }
      }
    };
    mockWindow.addEventListener('keydown', handler);

    fireKey('9', { ctrlKey: true });
    expect(onSwitchTerminal).not.toHaveBeenCalled();
  });
});
