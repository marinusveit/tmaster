import { beforeEach, describe, expect, it } from 'vitest';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import type { SplitMode } from '@renderer/stores/terminalStore';

describe('split view store integration', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      terminals: new Map(),
      activeTerminalId: null,
      splitMode: 'single' as SplitMode,
      splitRatio: 0.5,
    });
  });

  it('setSplitMode setzt den Modus korrekt', () => {
    const store = useTerminalStore.getState();

    store.setSplitMode('grid');
    expect(useTerminalStore.getState().splitMode).toBe('grid');

    store.setSplitMode('vertical');
    expect(useTerminalStore.getState().splitMode).toBe('vertical');
  });

  it('cycleSplitMode durchlaeuft alle Modi zyklisch', () => {
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

  it('setSplitRatio clampt auf 0.2 bis 0.8', () => {
    const store = useTerminalStore.getState();

    store.setSplitRatio(0.05);
    expect(useTerminalStore.getState().splitRatio).toBe(0.2);

    store.setSplitRatio(0.9);
    expect(useTerminalStore.getState().splitRatio).toBe(0.8);

    store.setSplitRatio(0.42);
    expect(useTerminalStore.getState().splitRatio).toBe(0.42);
  });

  it('resetSplitRatio setzt auf 0.5 zurueck', () => {
    const store = useTerminalStore.getState();

    store.setSplitRatio(0.75);
    expect(useTerminalStore.getState().splitRatio).toBe(0.75);

    store.resetSplitRatio();
    expect(useTerminalStore.getState().splitRatio).toBe(0.5);
  });
});
