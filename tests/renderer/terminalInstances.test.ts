import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const logRendererWarning = vi.fn();
  const transportInvoke = vi.fn();
  const transportOn = vi.fn(() => vi.fn());
  const mockWebglAddons: MockWebglAddon[] = [];
  const mockSearchAddons: MockSearchAddon[] = [];
  const setSearchResults = vi.fn();
  const searchState = {
    terminalId: null as string | null,
  };
  const state = {
    shouldThrowOnWebglCreation: false,
  };

  class MockTerminal {
    public cols = 80;
    public rows = 24;
    public element: { parentElement: object | null } | null = null;
    public buffer!: {
      active: {
        getLine: (lineIndex: number) => { translateToString: (trimRight: boolean) => string } | undefined;
        readonly length: number;
        viewportY: number;
      };
    };
    public readonly loadAddon = vi.fn();
    public readonly onData = vi.fn(() => ({ dispose: vi.fn() }));
    public readonly write = vi.fn();
    public readonly dispose = vi.fn();
    private readonly bufferLines: string[] = [];

    public constructor(public readonly options: Record<string, unknown>) {
      const active = {
        getLine: (lineIndex: number) => {
          const content = this.bufferLines[lineIndex];
          if (content === undefined) {
            return undefined;
          }

          return {
            translateToString: (trimRight: boolean) => {
              return trimRight ? content.replace(/\s+$/u, '') : content;
            },
          };
        },
        viewportY: 0,
      } as {
        getLine: (lineIndex: number) => { translateToString: (trimRight: boolean) => string } | undefined;
        readonly length: number;
        viewportY: number;
      };

      Object.defineProperty(active, 'length', {
        get: () => this.bufferLines.length,
      });

      this.buffer = { active };
    }

    public open(container: object): void {
      this.element = { parentElement: container };
    }

    public setBuffer(lines: string[], viewportY = 0): void {
      this.bufferLines.length = 0;
      this.bufferLines.push(...lines);
      this.buffer.active.viewportY = viewportY;
    }
  }

  class MockFitAddon {}

  class MockSearchAddon {
    public readonly clearActiveDecoration = vi.fn();
    public readonly clearDecorations = vi.fn();
    public readonly dispose = vi.fn();
    public readonly findNext = vi.fn(() => true);
    public readonly findPrevious = vi.fn(() => true);
    private onDidChangeResultsHandler: ((event: { resultIndex: number; resultCount: number }) => void) | null = null;

    public constructor(public readonly options?: Record<string, unknown>) {
      mockSearchAddons.push(this);
    }

    public onDidChangeResults(handler: (event: { resultIndex: number; resultCount: number }) => void): { dispose: () => void } {
      this.onDidChangeResultsHandler = handler;
      return { dispose: vi.fn() };
    }

    public triggerResults(event: { resultIndex: number; resultCount: number }): void {
      this.onDidChangeResultsHandler?.(event);
    }
  }

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
    MockSearchAddon,
    MockTerminal,
    MockWebglAddon,
    logRendererWarning,
    mockSearchAddons,
    mockWebglAddons,
    searchState,
    setSearchResults,
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

vi.mock('xterm-addon-search', () => ({
  SearchAddon: mocks.MockSearchAddon,
}));

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: mocks.MockWebglAddon,
}));

vi.mock('@renderer/stores/terminalStore', () => ({
  useTerminalStore: {
    getState: () => ({
      search: mocks.searchState,
      setSearchResults: mocks.setSearchResults,
    }),
  },
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
  clearTerminalSearch,
  clearTerminalSearchActiveDecoration,
  destroyTerminalInstance,
  enableTerminalWebgl,
  findNextTerminalSearchMatch,
  findPreviousTerminalSearchMatch,
  getOrCreateTerminal,
  hasTerminalInstance,
  refreshTerminalAppearance,
  readTerminalBuffer,
  updateTerminalSearch,
} from '@renderer/components/terminal/terminalInstances';

describe('terminalInstances', () => {
  afterEach(() => {
    for (const terminalId of ['t1', 't2', 't3', 't4']) {
      destroyTerminalInstance(terminalId);
    }
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    const cssVariables = new Map<string, string>();
    const style = {
      setProperty: (name: string, value: string) => {
        cssVariables.set(name, value);
      },
    };
    vi.stubGlobal('document', {
      documentElement: {
        style,
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => cssVariables.get(name) ?? '',
    }));

    document.documentElement.style.setProperty('--terminal-font-family', 'JetBrains Mono');
    document.documentElement.style.setProperty('--terminal-font-size', '14');
    document.documentElement.style.setProperty('--terminal-bg', '#101014');
    document.documentElement.style.setProperty('--terminal-fg', '#e6e6ec');
    document.documentElement.style.setProperty('--terminal-cursor', '#e8714a');
    document.documentElement.style.setProperty('--terminal-selection', 'rgba(232, 113, 74, 0.22)');
    mocks.mockSearchAddons.length = 0;
    mocks.mockWebglAddons.length = 0;
    mocks.searchState.terminalId = null;
    mocks.setSearchResults.mockReset();
    mocks.state.shouldThrowOnWebglCreation = false;
    mocks.logRendererWarning.mockReset();
    mocks.transportInvoke.mockReset();
    mocks.transportOn.mockClear();
  });

  it('erstellt xterm-Instanzen mit scrollback 5000', () => {
    const entry = getOrCreateTerminal('t1');
    const terminal = entry.terminal as unknown as MockTerminal;

    expect(terminal.options.scrollback).toBe(5000);
    expect(terminal.options.fontSize).toBe(14);
    expect(terminal.options.fontFamily).toBe('JetBrains Mono');
  });

  it('liest den kompletten Buffer als ANSI-freien Text aus', () => {
    const entry = getOrCreateTerminal('t1');
    const terminal = entry.terminal as unknown as MockTerminal;
    terminal.setBuffer(['alpha   ', 'beta', '']);

    expect(readTerminalBuffer('t1', 'full')).toBe('alpha\nbeta');
  });

  it('liest nur den sichtbaren Bereich aus dem Buffer aus', () => {
    const entry = getOrCreateTerminal('t2');
    const terminal = entry.terminal as unknown as MockTerminal;
    terminal.rows = 2;
    terminal.setBuffer(['zero', 'one', 'two', 'three'], 1);

    expect(readTerminalBuffer('t2', 'visible')).toBe('one\ntwo');
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

  it('aktualisiert gecachte Instanzen bei Appearance-Aenderungen', () => {
    const entry = getOrCreateTerminal('t1');
    const terminal = entry.terminal as unknown as MockTerminal;

    document.documentElement.style.setProperty('--terminal-font-family', 'Fira Code');
    document.documentElement.style.setProperty('--terminal-font-size', '18');
    document.documentElement.style.setProperty('--terminal-bg', '#ffffff');
    document.documentElement.style.setProperty('--terminal-fg', '#111111');

    refreshTerminalAppearance();

    expect(terminal.options.fontFamily).toBe('Fira Code');
    expect(terminal.options.fontSize).toBe(18);
    expect(terminal.options.theme).toMatchObject({
      background: '#ffffff',
      foreground: '#111111',
    });
  });

  it('laedt das Search-Addon und propagiert Ergebnis-Updates an den Store', () => {
    getOrCreateTerminal('t1');
    mocks.searchState.terminalId = 't1';

    mocks.mockSearchAddons[0]?.triggerResults({ resultIndex: 1, resultCount: 4 });

    expect(mocks.mockSearchAddons).toHaveLength(1);
    expect(mocks.setSearchResults).toHaveBeenCalledWith(1, 4);
  });

  it('aktualisiert die Suche inkrementell mit Highlight-Dekorationen', () => {
    getOrCreateTerminal('t2');
    const searchAddon = mocks.mockSearchAddons[0];

    updateTerminalSearch('t2', 'needle', { caseSensitive: true, regex: false });

    expect(searchAddon?.findNext).toHaveBeenCalledWith('needle', expect.objectContaining({
      caseSensitive: true,
      regex: false,
      incremental: true,
      decorations: expect.any(Object),
    }));
  });

  it('navigiert zu vorherigem und naechstem Match', () => {
    getOrCreateTerminal('t3');
    const searchAddon = mocks.mockSearchAddons[0];

    findNextTerminalSearchMatch('t3', 'needle', { caseSensitive: false, regex: true });
    findPreviousTerminalSearchMatch('t3', 'needle', { caseSensitive: false, regex: true });

    expect(searchAddon?.findNext).toHaveBeenCalledWith('needle', expect.objectContaining({
      regex: true,
    }));
    expect(searchAddon?.findPrevious).toHaveBeenCalledWith('needle', expect.objectContaining({
      regex: true,
    }));
  });

  it('raeumt Suchdekorationen explizit auf', () => {
    getOrCreateTerminal('t4');
    const searchAddon = mocks.mockSearchAddons[0];

    clearTerminalSearch('t4');
    clearTerminalSearchActiveDecoration('t4');

    expect(searchAddon?.clearDecorations).toHaveBeenCalledTimes(1);
    expect(searchAddon?.clearActiveDecoration).toHaveBeenCalledTimes(1);
    expect(mocks.setSearchResults).toHaveBeenCalledWith(-1, 0);
  });
});
