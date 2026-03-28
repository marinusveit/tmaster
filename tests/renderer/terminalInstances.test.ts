import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const logRendererWarning = vi.fn();
  const transportInvoke = vi.fn();
  const transportOn = vi.fn(() => vi.fn());
  const mockWebglAddons: MockWebglAddon[] = [];
  const state = {
    shouldThrowOnWebglCreation: false,
  };

  class MockTerminal {
    public cols = 80;
    public rows = 24;
    public element: { parentElement: object | null } | null = null;
    public readonly loadAddon = vi.fn();
    public readonly onData = vi.fn(() => ({ dispose: vi.fn() }));
    public readonly write = vi.fn();
    public readonly dispose = vi.fn();

    public constructor(public readonly options: Record<string, unknown>) {}

    public open(container: object): void {
      this.element = { parentElement: container };
    }
  }

  class MockFitAddon {}

  class MockWebglAddon {
    public readonly dispose = vi.fn();
    private onContextLossHandler: (() => void) | null = null;

    public constructor() {
      if (state.shouldThrowOnWebglCreation) {
        throw new Error('webgl unavailable');
      }

      mockWebglAddons.push(this);
    }

    public onContextLoss(handler: () => void): { dispose: () => void } {
      this.onContextLossHandler = handler;
      return { dispose: vi.fn() };
    }

    public triggerContextLoss(): void {
      this.onContextLossHandler?.();
    }
  }

  return {
    MockFitAddon,
    MockTerminal,
    MockWebglAddon,
    logRendererWarning,
    mockWebglAddons,
    state,
    transportInvoke,
    transportOn,
  };
});

type MockTerminal = InstanceType<typeof mocks.MockTerminal>;

vi.mock('xterm', () => ({
  Terminal: mocks.MockTerminal,
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: mocks.MockFitAddon,
}));

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: mocks.MockWebglAddon,
}));

vi.mock('@renderer/transport', () => ({
  transport: {
    invoke: mocks.transportInvoke,
    on: mocks.transportOn,
  },
}));

vi.mock('@renderer/utils/logger', () => ({
  logRendererWarning: mocks.logRendererWarning,
}));

import {
  destroyTerminalInstance,
  enableTerminalWebgl,
  getOrCreateTerminal,
  hasTerminalInstance,
} from '@renderer/components/terminal/terminalInstances';

describe('terminalInstances', () => {
  afterEach(() => {
    for (const terminalId of ['t1', 't2', 't3', 't4']) {
      destroyTerminalInstance(terminalId);
    }
  });

  beforeEach(() => {
    mocks.mockWebglAddons.length = 0;
    mocks.state.shouldThrowOnWebglCreation = false;
    mocks.logRendererWarning.mockReset();
    mocks.transportInvoke.mockReset();
    mocks.transportOn.mockClear();
  });

  it('erstellt xterm-Instanzen mit scrollback 5000', () => {
    const entry = getOrCreateTerminal('t1');
    const terminal = entry.terminal as unknown as MockTerminal;

    expect(terminal.options.scrollback).toBe(5000);
  });

  it('aktiviert WebGL nur einmal pro sichtbarer Instanz', () => {
    const entry = getOrCreateTerminal('t2');

    enableTerminalWebgl(entry);
    enableTerminalWebgl(entry);

    expect(mocks.mockWebglAddons).toHaveLength(1);
    expect(entry.webglAddon).toBe(mocks.mockWebglAddons[0] ?? null);
  });

  it('faellt bei Context-Loss dauerhaft auf Canvas zurueck', () => {
    const entry = getOrCreateTerminal('t3');

    enableTerminalWebgl(entry);
    const addon = mocks.mockWebglAddons[0];
    addon?.triggerContextLoss();
    enableTerminalWebgl(entry);

    expect(addon?.dispose).toHaveBeenCalledTimes(1);
    expect(entry.webglAddon).toBeNull();
    expect(entry.isWebglSupported).toBe(false);
    expect(mocks.mockWebglAddons).toHaveLength(1);
  });

  it('loggt WebGL-Initialisierungsfehler und bleibt nutzbar', () => {
    mocks.state.shouldThrowOnWebglCreation = true;
    const entry = getOrCreateTerminal('t4');

    enableTerminalWebgl(entry);

    expect(entry.webglAddon).toBeNull();
    expect(entry.isWebglSupported).toBe(false);
    expect(mocks.logRendererWarning).toHaveBeenCalledTimes(1);
  });

  it('raeumt gecachte Instanzen deterministisch auf', () => {
    const entry = getOrCreateTerminal('t1');
    const terminal = entry.terminal as unknown as MockTerminal;
    enableTerminalWebgl(entry);
    const addon = mocks.mockWebglAddons[0];

    destroyTerminalInstance('t1');

    expect(addon?.dispose).toHaveBeenCalledTimes(1);
    expect(terminal.dispose).toHaveBeenCalledTimes(1);
    expect(hasTerminalInstance('t1')).toBe(false);
  });
});
