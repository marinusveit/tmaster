import { beforeEach, describe, expect, it } from 'vitest';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import type { TerminalSessionInfo } from '@shared/types/terminal';

const makeTerminal = (overrides: Partial<TerminalSessionInfo> = {}): TerminalSessionInfo => ({
  terminalId: `t-${Math.random().toString(36).slice(2)}`,
  label: { prefix: 'T', index: 1 },
  workspaceId: 'ws-default',
  status: 'active',
  createdAt: Date.now(),
  ...overrides,
});

describe('terminalStore', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      terminals: new Map(),
      activeTerminalId: null,
    });
  });

  it('fügt Terminals hinzu und entfernt sie', () => {
    const store = useTerminalStore.getState();
    const terminal = makeTerminal({ terminalId: 't1' });

    store.addTerminal(terminal);
    expect(useTerminalStore.getState().terminals.size).toBe(1);

    store.removeTerminal('t1');
    expect(useTerminalStore.getState().terminals.size).toBe(0);
  });

  it('setzt activeTerminalId auf null wenn aktives Terminal entfernt wird', () => {
    const store = useTerminalStore.getState();
    const terminal = makeTerminal({ terminalId: 't1' });

    store.addTerminal(terminal);
    store.setActiveTerminal('t1');
    expect(useTerminalStore.getState().activeTerminalId).toBe('t1');

    store.removeTerminal('t1');
    expect(useTerminalStore.getState().activeTerminalId).toBeNull();
  });

  it('sortiert Terminals nach label.index', () => {
    const store = useTerminalStore.getState();
    store.addTerminal(makeTerminal({ terminalId: 't3', label: { prefix: 'T', index: 3 } }));
    store.addTerminal(makeTerminal({ terminalId: 't1', label: { prefix: 'T', index: 1 } }));
    store.addTerminal(makeTerminal({ terminalId: 't2', label: { prefix: 'T', index: 2 } }));

    const ordered = useTerminalStore.getState().getOrderedTerminals();
    expect(ordered.map((t) => t.terminalId)).toEqual(['t1', 't2', 't3']);
  });

  it('filtert Terminals nach Workspace', () => {
    const store = useTerminalStore.getState();
    store.addTerminal(makeTerminal({ terminalId: 't1', workspaceId: 'ws-a', label: { prefix: 'T', index: 1 } }));
    store.addTerminal(makeTerminal({ terminalId: 't2', workspaceId: 'ws-b', label: { prefix: 'T', index: 1 } }));
    store.addTerminal(makeTerminal({ terminalId: 't3', workspaceId: 'ws-a', label: { prefix: 'T', index: 2 } }));

    const wsA = useTerminalStore.getState().getTerminalsByWorkspace('ws-a');
    expect(wsA).toHaveLength(2);
    expect(wsA.map((t) => t.terminalId)).toEqual(['t1', 't3']);
  });

  it('updated den Status eines Terminals', () => {
    const store = useTerminalStore.getState();
    store.addTerminal(makeTerminal({ terminalId: 't1', status: 'active' }));

    store.updateStatus('t1', 'exited');
    expect(useTerminalStore.getState().terminals.get('t1')?.status).toBe('exited');
  });
});
