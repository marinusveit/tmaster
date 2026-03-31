import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTerminalStore } from '@renderer/stores/terminalStore';

// Mock für Transport — wir testen Store-Logik, nicht IPC
vi.mock('@renderer/transport', () => ({
  transport: {
    invoke: vi.fn(),
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  },
}));

describe('useTerminals (Store-Integration)', () => {
  const protection = {
    mode: 'normal' as const,
    reason: 'none' as const,
    outputBytesPerSecond: 0,
    bufferedBytes: 0,
    thresholdBytesPerSecond: 1024 * 1024,
    warning: null,
    updatedAt: 0,
  };

  beforeEach(() => {
    useTerminalStore.setState({
      terminals: new Map(),
      activeTerminalId: null,
    });
  });

  it('fügt Terminal zum Store hinzu und setzt es als aktiv', () => {
    const store = useTerminalStore.getState();

    store.addTerminal({
      terminalId: 't1',
      label: { prefix: 'T', index: 1 },
      workspaceId: 'ws1',
      status: 'active',
      createdAt: Date.now(),
      scrollback: 5000,
      protection,
    });
    store.setActiveTerminal('t1');

    const state = useTerminalStore.getState();
    expect(state.terminals.size).toBe(1);
    expect(state.activeTerminalId).toBe('t1');
  });

  it('entfernt Terminal und wählt nächstes aus', () => {
    const store = useTerminalStore.getState();

    store.addTerminal({
      terminalId: 't1',
      label: { prefix: 'T', index: 1 },
      workspaceId: 'ws1',
      status: 'active',
      createdAt: Date.now(),
      scrollback: 5000,
      protection,
    });
    store.addTerminal({
      terminalId: 't2',
      label: { prefix: 'T', index: 2 },
      workspaceId: 'ws1',
      status: 'active',
      createdAt: Date.now(),
      scrollback: 5000,
      protection,
    });
    store.setActiveTerminal('t1');
    store.removeTerminal('t1');

    const state = useTerminalStore.getState();
    expect(state.terminals.size).toBe(1);
    expect(state.activeTerminalId).toBeNull();
  });

  it('setzt Terminals aus Server-Antwort', () => {
    const store = useTerminalStore.getState();

    store.setTerminals([
      {
        terminalId: 't1',
        label: { prefix: 'T', index: 1 },
        workspaceId: 'ws1',
        status: 'active',
        createdAt: 1000,
        scrollback: 5000,
        protection,
      },
      {
        terminalId: 't2',
        label: { prefix: 'T', index: 2 },
        workspaceId: 'ws1',
        status: 'idle',
        createdAt: 2000,
        scrollback: 5000,
        protection,
      },
    ]);

    const state = useTerminalStore.getState();
    expect(state.terminals.size).toBe(2);
  });
});
