import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import type { TerminalId, TerminalDataEvent, TerminalExitEvent } from '@shared/types/terminal';
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
  cleanups: (() => void)[];
  isOpened: boolean;
}

const cache = new Map<TerminalId, CachedTerminal>();

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
    fontFamily: 'JetBrains Mono, monospace',
    theme: {
      background: '#101014',
      foreground: '#e6e6ec',
    },
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
    cleanups,
    isOpened: false,
  };
  cache.set(terminalId, entry);
  return entry;
};

/**
 * Aktiviert den WebGL-Renderer fuer sichtbare Terminal-Views.
 * Faellt bei Fehlern automatisch auf Canvas zurueck.
 */
export const enableTerminalWebgl = (entry: CachedTerminal): void => {
  if (entry.webglAddon) {
    return;
  }

  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      webglAddon.dispose();
      if (entry.webglAddon === webglAddon) {
        entry.webglAddon = null;
      }
    });
    entry.terminal.loadAddon(webglAddon);
    entry.webglAddon = webglAddon;
  } catch (error: unknown) {
    // WebGL ist optional: Terminal bleibt mit Canvas-Renderer funktionsfaehig.
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
