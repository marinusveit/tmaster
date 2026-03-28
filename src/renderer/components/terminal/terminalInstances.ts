import { Terminal, type ITheme } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import type {
  TerminalId,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalExportScope,
} from '@shared/types/terminal';
import { transport } from '@renderer/transport';
import { logRendererWarning } from '@renderer/utils/logger';

/**
 * Cached xterm.js-Instanz. Lebt unabhängig vom React-Lifecycle,
 * damit Remounts (z.B. durch StrictMode oder loadTerminals-Race)
 * den Buffer nicht zerstören.
 */
export interface CachedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  webglAddon: WebglAddon | null;
  isWebglSupported: boolean;
  cleanups: (() => void)[];
  isOpened: boolean;
}

const cache = new Map<TerminalId, CachedTerminal>();

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
  entry.terminal.options.fontFamily = readCssVariable('--terminal-font-family', 'JetBrains Mono');
  entry.terminal.options.fontSize = readTerminalFontSize();
  entry.terminal.options.theme = readTerminalTheme();

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
    scrollback: 5000,
    fontFamily: readCssVariable('--terminal-font-family', 'JetBrains Mono'),
    fontSize: readTerminalFontSize(),
    theme: readTerminalTheme(),
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

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

  const entry: CachedTerminal = {
    terminal,
    fitAddon,
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
