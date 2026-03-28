import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { DEFAULT_TERMINAL_SCROLLBACK } from '@shared/constants/defaults';
import type {
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalId,
  TerminalProtectionEvent,
  TerminalProtectionState,
  TerminalSessionInfo,
} from '@shared/types/terminal';
import { transport } from '@renderer/transport';
import { logRendererWarning } from '@renderer/utils/logger';
import { TerminalOutputController } from './TerminalOutputController';

/**
 * Cached xterm.js-Instanz. Lebt unabhängig vom React-Lifecycle,
 * damit Remounts (z.B. durch StrictMode oder loadTerminals-Race)
 * den Buffer nicht zerstören.
 */
export interface CachedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  webglAddon: WebglAddon | null;
  outputController: TerminalOutputController;
  protection: TerminalProtectionState;
  cleanups: (() => void)[];
  isOpened: boolean;
}

const cache = new Map<TerminalId, CachedTerminal>();

const DEFAULT_PROTECTION_STATE: TerminalProtectionState = {
  renderMode: 'realtime',
  isProtectionActive: false,
  outputBytesPerSecond: 0,
  pendingBufferBytes: 0,
  warning: null,
};

const resolveProtection = (protection?: TerminalProtectionState): TerminalProtectionState => {
  return protection ? { ...protection } : { ...DEFAULT_PROTECTION_STATE };
};

/**
 * Gibt eine bestehende xterm-Instanz zurück oder erstellt eine neue.
 * IPC-Listener werden einmal beim Erstellen registriert.
 */
export const getOrCreateTerminal = (terminalSession: TerminalSessionInfo): CachedTerminal => {
  const existing = cache.get(terminalSession.terminalId);
  if (existing) {
    existing.terminal.options.scrollback = terminalSession.scrollback ?? DEFAULT_TERMINAL_SCROLLBACK;
    const protection = resolveProtection(terminalSession.protection);
    existing.protection = protection;
    existing.outputController.setProtection(protection);
    return existing;
  }

  const protection = resolveProtection(terminalSession.protection);
  const terminal = new Terminal({
    cursorBlink: true,
    scrollback: terminalSession.scrollback ?? DEFAULT_TERMINAL_SCROLLBACK,
    fontFamily: 'JetBrains Mono, monospace',
    theme: {
      background: '#101014',
      foreground: '#e6e6ec',
    },
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const cleanups: (() => void)[] = [];
  const outputController = new TerminalOutputController((data) => {
    terminal.write(data);
  }, protection);
  const entry: CachedTerminal = {
    terminal,
    fitAddon,
    webglAddon: null,
    outputController,
    protection,
    cleanups,
    isOpened: false,
  };

  // User-Input → PTY
  const inputSub = terminal.onData((data) => {
    void transport.invoke<void>('writeTerminal', { terminalId: terminalSession.terminalId, data });
  });
  cleanups.push(() => inputSub.dispose());

  // PTY-Output → xterm
  const dataCleanup = transport.on<TerminalDataEvent>('onTerminalData', (event) => {
    if (event.terminalId !== terminalSession.terminalId) {
      return;
    }

    outputController.push(event.data);
  });
  cleanups.push(dataCleanup);

  const protectionCleanup = transport.on<TerminalProtectionEvent>('onTerminalProtection', (event) => {
    if (event.terminalId !== terminalSession.terminalId) {
      return;
    }

    entry.protection = { ...event.protection };
    outputController.setProtection(entry.protection);
  });
  cleanups.push(protectionCleanup);

  // PTY-Exit → Nachricht im Terminal
  const exitCleanup = transport.on<TerminalExitEvent>('onTerminalExit', (event) => {
    if (event.terminalId !== terminalSession.terminalId) {
      return;
    }

    outputController.flush();
    terminal.write('\r\n\x1b[33m[process exited]\x1b[0m\r\n');
  });
  cleanups.push(exitCleanup);

  cache.set(terminalSession.terminalId, entry);
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

  entry.outputController.dispose();
  entry.terminal.dispose();
  cache.delete(terminalId);
};

/**
 * Prüft ob eine Instanz im Cache existiert.
 */
export const hasTerminalInstance = (terminalId: TerminalId): boolean => {
  return cache.has(terminalId);
};
