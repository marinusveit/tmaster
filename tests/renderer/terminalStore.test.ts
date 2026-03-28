import { beforeEach, describe, expect, it } from 'vitest';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import type { SplitMode } from '@renderer/stores/terminalStore';
import type { TerminalSessionInfo } from '@shared/types/terminal';

const makeTerminal = (overrides: Partial<TerminalSessionInfo> = {}): TerminalSessionInfo => ({
  terminalId: `t-${Math.random().toString(36).slice(2)}`,
  label: { prefix: 'T', index: 1 },
  workspaceId: 'ws-default',
  displayOrder: 1,
  status: 'active',
  createdAt: Date.now(),
  ...overrides,
});

describe('terminalStore', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      terminals: new Map(),
      activeTerminalId: null,
      splitMode: 'single' as SplitMode,
      splitRatio: 0.5,
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
    store.addTerminal(makeTerminal({ terminalId: 't3', label: { prefix: 'T', index: 3 }, displayOrder: 3 }));
    store.addTerminal(makeTerminal({ terminalId: 't1', label: { prefix: 'T', index: 1 }, displayOrder: 1 }));
    store.addTerminal(makeTerminal({ terminalId: 't2', label: { prefix: 'T', index: 2 }, displayOrder: 2 }));

    const ordered = useTerminalStore.getState().getOrderedTerminals();
    expect(ordered.map((t) => t.terminalId)).toEqual(['t1', 't2', 't3']);
  });

  it('ordnet Terminals im Workspace neu und aktualisiert displayOrder', () => {
    const store = useTerminalStore.getState();
    store.addTerminal(makeTerminal({ terminalId: 't1', workspaceId: 'ws-a', displayOrder: 1 }));
    store.addTerminal(makeTerminal({ terminalId: 't2', workspaceId: 'ws-a', displayOrder: 2 }));
    store.addTerminal(makeTerminal({ terminalId: 't3', workspaceId: 'ws-a', displayOrder: 3 }));

    store.reorderTerminals('ws-a', ['t3', 't1', 't2']);

    const ordered = useTerminalStore.getState().getTerminalsByWorkspace('ws-a');
    expect(ordered.map((terminal) => terminal.terminalId)).toEqual(['t3', 't1', 't2']);
    expect(ordered.map((terminal) => terminal.displayOrder)).toEqual([1, 2, 3]);
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

  it('setzt Waiting-State mit Kontext', () => {
    const store = useTerminalStore.getState();
    store.addTerminal(makeTerminal({ terminalId: 't1' }));

    store.setWaitingState('t1', 'Continue deploy? [Y/n]', 1234);

    expect(useTerminalStore.getState().terminals.get('t1')).toEqual(expect.objectContaining({
      isWaiting: true,
      waitingContext: 'Continue deploy? [Y/n]',
      waitingSince: 1234,
    }));
  });

  it('loescht Waiting-State wieder', () => {
    const store = useTerminalStore.getState();
    store.addTerminal(makeTerminal({ terminalId: 't1', isWaiting: true, waitingContext: 'Prompt', waitingSince: 1234 }));

    store.clearWaitingState('t1');

    expect(useTerminalStore.getState().terminals.get('t1')).toEqual(expect.objectContaining({
      isWaiting: false,
      waitingContext: undefined,
      waitingSince: undefined,
    }));
  });

  it('behaelt Waiting-Metadaten beim setTerminals-Refresh', () => {
    const store = useTerminalStore.getState();
    store.addTerminal(makeTerminal({
      terminalId: 't1',
      label: { prefix: 'T', index: 1 },
      isWaiting: true,
      waitingContext: 'Apply migration? [Y/n]',
      waitingSince: 99,
    }));

    store.setTerminals([
      makeTerminal({
        terminalId: 't1',
        label: { prefix: 'T', index: 1 },
        status: 'active',
      }),
    ]);

    expect(useTerminalStore.getState().terminals.get('t1')).toEqual(expect.objectContaining({
      isWaiting: true,
      waitingContext: 'Apply migration? [Y/n]',
      waitingSince: 99,
    }));
  });

  it('durchlaeuft Split-Modi zyklisch', () => {
    const store = useTerminalStore.getState();

    expect(useTerminalStore.getState().splitMode).toBe('single');

    store.cycleSplitMode();
    expect(useTerminalStore.getState().splitMode).toBe('horizontal');

    store.cycleSplitMode();
    expect(useTerminalStore.getState().splitMode).toBe('vertical');

    store.cycleSplitMode();
    expect(useTerminalStore.getState().splitMode).toBe('grid');

    store.cycleSplitMode();
    expect(useTerminalStore.getState().splitMode).toBe('single');
  });

  it('setzt Split-Mode direkt', () => {
    const store = useTerminalStore.getState();

    store.setSplitMode('grid');
    expect(useTerminalStore.getState().splitMode).toBe('grid');

    store.setSplitMode('vertical');
    expect(useTerminalStore.getState().splitMode).toBe('vertical');
  });
});
