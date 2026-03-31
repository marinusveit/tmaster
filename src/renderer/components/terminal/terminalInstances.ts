import { Terminal, type ITheme } from 'xterm';
import {
  SearchAddon,
  type SearchAddonInstance,
  type SearchOptions,
} from '@renderer/components/terminal/xtermAddonSearchVendor';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { DEFAULT_TERMINAL_SCROLLBACK as DEFAULT_SCROLLBACK } from '@shared/types/terminal';
import type { TerminalId, TerminalDataEvent, TerminalExitEvent, TerminalExportScope } from '@shared/types/terminal';
import { transport } from '@renderer/transport';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { logRendererWarning } from '@renderer/utils/logger';

/**
 * Cached xterm.js-Instanz. Lebt unabhängig vom React-Lifecycle,
 * damit Remounts (z.B. durch StrictMode oder loadTerminals-Race)
 * den Buffer nicht zerstören.
 */
export interface CachedTerminal {
  terminalId: TerminalId;
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddonInstance;
  webglAddon: WebglAddon | null;
  isWebglSupported: boolean;
  cleanups: (() => void)[];
  isOpened: boolean;
}

const cache = new Map<TerminalId, CachedTerminal>();
const SEARCH_DECORATIONS: NonNullable<SearchOptions['decorations']> = {
  matchBackground: '#3f291d',
  matchBorder: '#c16a44',
  matchOverviewRuler: '#a45433',
  activeMatchBackground: '#e87e4d',
  activeMatchBorder: '#ffcfb4',
  activeMatchColorOverviewRuler: '#f6a271',
};

interface TerminalSearchOptions {
  caseSensitive: boolean;
  regex: boolean;
  incremental?: boolean;
}

interface SearchResultChangeEvent {
  resultIndex: number;
  resultCount: number;
}

const buildSearchOptions = (options: TerminalSearchOptions): SearchOptions => ({
  caseSensitive: options.caseSensitive,
  regex: options.regex,
  incremental: options.incremental,
  decorations: SEARCH_DECORATIONS,
});

const getCachedTerminal = (terminalId: TerminalId): CachedTerminal | undefined => {
  return cache.get(terminalId);
};

const readCssVariable = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') {
    return fallback;
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const readTerminalFontSize = (): number => {
  const value = readCssVariable('--terminal-font-size', '14');
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : 14;
};

const readTerminalTheme = (): ITheme => {
  return {
    background: readCssVariable('--terminal-bg', '#101014'),
    foreground: readCssVariable('--terminal-fg', '#e6e6ec'),
    cursor: readCssVariable('--terminal-cursor', '#e8714a'),
    selectionBackground: readCssVariable('--terminal-selection', 'rgba(232, 113, 74, 0.22)'),
  };
};

const applyTerminalAppearance = (entry: CachedTerminal): void => {
  const terminalState = useTerminalStore.getState().terminals.get(entry.terminalId);
  entry.terminal.options.fontFamily = readCssVariable('--terminal-font-family', 'JetBrains Mono');
  entry.terminal.options.fontSize = readTerminalFontSize();
  entry.terminal.options.theme = readTerminalTheme();
  entry.terminal.options.scrollback = terminalState?.scrollback ?? DEFAULT_SCROLLBACK;

  if (entry.isOpened) {
    entry.fitAddon.fit();
  }
};

/**
 * Gibt eine bestehende xterm-Instanz zurück oder erstellt eine neue.
 * IPC-Listener werden einmal beim Erstellen registriert.
 */
export const getOrCreateTerminal = (terminalId: TerminalId): CachedTerminal => {
  const existing = cache.get(terminalId);
  if (existing) {
    return existing;
  }

  const terminal = new Terminal({
    cursorBlink: true,
    scrollback: useTerminalStore.getState().terminals.get(terminalId)?.scrollback ?? DEFAULT_SCROLLBACK,
    fontFamily: readCssVariable('--terminal-font-family', 'JetBrains Mono'),
    fontSize: readTerminalFontSize(),
    theme: readTerminalTheme(),
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  const searchAddon = new SearchAddon({ highlightLimit: 500 });
  terminal.loadAddon(searchAddon);

  const cleanups: (() => void)[] = [];

  // User-Input → PTY
  const inputSub = terminal.onData((data) => {
    void transport.invoke<void>('writeTerminal', { terminalId, data });
  });
  cleanups.push(() => inputSub.dispose());

  // PTY-Output → xterm
  const dataCleanup = transport.on<TerminalDataEvent>('onTerminalData', (event) => {
    if (event.terminalId !== terminalId) {
      return;
    }

    terminal.write(event.data);
  });
  cleanups.push(dataCleanup);

  // PTY-Exit → Nachricht im Terminal
  const exitCleanup = transport.on<TerminalExitEvent>('onTerminalExit', (event) => {
    if (event.terminalId !== terminalId) {
      return;
    }

    terminal.write('\r\n\x1b[33m[process exited]\x1b[0m\r\n');
  });
  cleanups.push(exitCleanup);

  const searchResultsSub = searchAddon.onDidChangeResults((event: SearchResultChangeEvent) => {
    const searchState = useTerminalStore.getState().search;
    if (searchState.terminalId !== terminalId) {
      return;
    }

    useTerminalStore.getState().setSearchResults(event.resultIndex, event.resultCount);
  });
  cleanups.push(() => searchResultsSub.dispose());

  const entry: CachedTerminal = {
    terminalId,
    terminal,
    fitAddon,
    searchAddon,
    webglAddon: null,
    isWebglSupported: true,
    cleanups,
    isOpened: false,
  };
  cache.set(terminalId, entry);
  applyTerminalAppearance(entry);
  return entry;
};

/**
 * Aktiviert den WebGL-Renderer fuer sichtbare Terminal-Views.
 * Faellt bei Fehlern automatisch auf Canvas zurueck.
 */
export const enableTerminalWebgl = (entry: CachedTerminal): void => {
  if (entry.webglAddon || !entry.isWebglSupported) {
    return;
  }

  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      webglAddon.dispose();
      if (entry.webglAddon === webglAddon) {
        entry.webglAddon = null;
      }
      entry.isWebglSupported = false;
    });
    entry.terminal.loadAddon(webglAddon);
    entry.webglAddon = webglAddon;
  } catch (error: unknown) {
    // WebGL ist optional: Terminal bleibt mit Canvas-Renderer funktionsfaehig.
    entry.isWebglSupported = false;
    logRendererWarning('WebGL-Addon konnte nicht aktiviert werden, Fallback auf Canvas.', error);
  }
};

/**
 * Deaktiviert den WebGL-Renderer fuer unsichtbare Terminal-Views.
 */
export const disableTerminalWebgl = (terminalId: TerminalId): void => {
  const entry = cache.get(terminalId);
  if (!entry?.webglAddon) {
    return;
  }

  entry.webglAddon.dispose();
  entry.webglAddon = null;
};

/**
 * Zerstört eine cached Instanz. Wird aufgerufen wenn der Terminal-Tab geschlossen wird.
 */
export const destroyTerminalInstance = (terminalId: TerminalId): void => {
  const entry = cache.get(terminalId);
  if (!entry) {
    return;
  }

  disableTerminalWebgl(terminalId);

  for (const cleanup of entry.cleanups) {
    cleanup();
  }

  entry.terminal.dispose();
  cache.delete(terminalId);
};

/**
 * Prüft ob eine Instanz im Cache existiert.
 */
export const hasTerminalInstance = (terminalId: TerminalId): boolean => {
  return cache.has(terminalId);
};

export const refreshTerminalAppearance = (): void => {
  for (const entry of cache.values()) {
    applyTerminalAppearance(entry);
  }
};

const trimTrailingEmptyLines = (lines: string[]): string[] => {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === '') {
    end -= 1;
  }

  return lines.slice(0, end);
};

export const readTerminalBuffer = (terminalId: TerminalId, scope: TerminalExportScope): string => {
  const entry = cache.get(terminalId);
  if (!entry) {
    throw new Error(`Terminal ${terminalId} is not mounted`);
  }

  const { terminal } = entry;
  const buffer = terminal.buffer.active;
  const totalLines = buffer.length;
  if (totalLines === 0) {
    return '';
  }

  const startLine = scope === 'visible' ? Math.max(0, buffer.viewportY) : 0;
  const endLineExclusive = scope === 'visible'
    ? Math.min(totalLines, buffer.viewportY + Math.max(1, terminal.rows))
    : totalLines;

  const lines: string[] = [];
  for (let lineIndex = startLine; lineIndex < endLineExclusive; lineIndex += 1) {
    const line = buffer.getLine(lineIndex);
    lines.push(line?.translateToString(true) ?? '');
  }

  return trimTrailingEmptyLines(lines).join('\n');
};

export const updateTerminalSearch = (
  terminalId: TerminalId,
  query: string,
  options: TerminalSearchOptions,
): boolean => {
  const entry = getCachedTerminal(terminalId);
  if (!entry) {
    return false;
  }

  if (query.length === 0) {
    entry.searchAddon.clearDecorations();
    useTerminalStore.getState().setSearchResults(-1, 0);
    return false;
  }

  try {
    return entry.searchAddon.findNext(query, buildSearchOptions({
      ...options,
      incremental: true,
    }));
  } catch (error: unknown) {
    useTerminalStore.getState().setSearchResults(-1, 0);
    logRendererWarning('Terminal-Suche konnte nicht aktualisiert werden.', error);
    return false;
  }
};

export const findNextTerminalSearchMatch = (
  terminalId: TerminalId,
  query: string,
  options: TerminalSearchOptions,
): boolean => {
  const entry = getCachedTerminal(terminalId);
  if (!entry || query.length === 0) {
    return false;
  }

  try {
    return entry.searchAddon.findNext(query, buildSearchOptions(options));
  } catch (error: unknown) {
    logRendererWarning('Naechstes Suchergebnis konnte nicht gefunden werden.', error);
    return false;
  }
};

export const findPreviousTerminalSearchMatch = (
  terminalId: TerminalId,
  query: string,
  options: TerminalSearchOptions,
): boolean => {
  const entry = getCachedTerminal(terminalId);
  if (!entry || query.length === 0) {
    return false;
  }

  try {
    return entry.searchAddon.findPrevious(query, buildSearchOptions(options));
  } catch (error: unknown) {
    logRendererWarning('Vorheriges Suchergebnis konnte nicht gefunden werden.', error);
    return false;
  }
};

export const clearTerminalSearch = (terminalId: TerminalId): void => {
  const entry = getCachedTerminal(terminalId);
  if (!entry) {
    return;
  }

  entry.searchAddon.clearDecorations();
  useTerminalStore.getState().setSearchResults(-1, 0);
};

export const clearTerminalSearchActiveDecoration = (terminalId: TerminalId): void => {
  const entry = getCachedTerminal(terminalId);
  if (!entry) {
    return;
  }

  entry.searchAddon.clearActiveDecoration();
};
