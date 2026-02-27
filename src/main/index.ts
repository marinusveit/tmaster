import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { TerminalManager } from './terminal/TerminalManager';
import { registerTerminalHandlers } from './ipc/registerTerminalHandlers';
import { registerWorkspaceHandlers } from './ipc/registerWorkspaceHandlers';
import { getDatabase, closeDatabase } from './db/database';
import { runMigrations } from './db/migrations';
import { registerAppLifecycleHandlers } from './lifecycle/registerAppLifecycleHandlers';
import {
  listWorkspaces,
  createWorkspace,
  markOrphanedSessionsAsExited,
  createSession,
  endSession,
  getWorkspace,
} from './db/queries';

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
let terminalManager: TerminalManager | null = null;

const broadcast = (channel: string, payload: unknown): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send(channel, payload);
  }
};

const destroyAllTerminals = (): void => {
  terminalManager?.destroyAll();
};

const createMainWindow = async (): Promise<BrowserWindow> => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#101014',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Alle PTYs beenden wenn das Fenster geschlossen wird
  mainWindow.on('closed', () => {
    destroyAllTerminals();
  });

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    return mainWindow;
  }

  await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  return mainWindow;
};

const bootstrap = async (): Promise<void> => {
  // DB initialisieren
  const db = getDatabase();
  runMigrations(db);

  // Crash-Recovery: verwaiste Sessions als 'exited' markieren
  markOrphanedSessionsAsExited(db);

  // Default-Workspace anlegen falls DB leer
  const existingWorkspaces = listWorkspaces(db);
  let defaultWorkspaceId: string;

  if (existingWorkspaces.length === 0) {
    defaultWorkspaceId = randomUUID();
    createWorkspace(db, defaultWorkspaceId, 'Default', process.cwd(), Date.now());
  } else {
    defaultWorkspaceId = existingWorkspaces[0]?.id ?? randomUUID();
  }

  terminalManager = new TerminalManager({
    onData: (event) => {
      broadcast(IPC_CHANNELS.terminalData, event);
    },
    onExit: (event) => {
      // Session in DB beenden
      endSession(db, event.terminalId);
      broadcast(IPC_CHANNELS.terminalExit, event);
    },
    onStatusChange: (terminalId, status) => {
      broadcast(IPC_CHANNELS.terminalStatus, { terminalId, status });
    },
  });

  // Label-Counter aus DB laden
  const workspaces = listWorkspaces(db);
  for (const ws of workspaces) {
    terminalManager.setLabelCounter(ws.id, ws.next_terminal_index);
  }

  // Originalen createTerminal wrappen um Sessions in DB zu tracken
  const originalCreateTerminal = terminalManager.createTerminal.bind(terminalManager);
  terminalManager.createTerminal = (request) => {
    const workspaceId = request.workspaceId ?? defaultWorkspaceId;
    const requestWithWorkspace = { ...request, workspaceId };
    const response = originalCreateTerminal(requestWithWorkspace);

    // Session in DB speichern
    const sessionId = randomUUID();
    createSession(
      db,
      sessionId,
      response.terminalId,
      response.workspaceId,
      response.label.prefix,
      response.label.index,
      request.shell ?? null,
      Date.now(),
    );

    // Label-Counter in DB ist bereits durch TerminalManager hochgezählt,
    // DB-Counter wird beim nächsten Start über setLabelCounter synchronisiert.
    // Für Konsistenz aktualisieren wir die DB direkt:
    const ws = getWorkspace(db, response.workspaceId);
    if (ws) {
      db.prepare('UPDATE workspaces SET next_terminal_index = ? WHERE id = ?').run(
        response.label.index + 1,
        response.workspaceId,
      );
    }

    return response;
  };

  registerTerminalHandlers(ipcMain, terminalManager);
  registerWorkspaceHandlers(ipcMain, db, terminalManager);

  const lifecycleApp = {
    on: (
      event: 'activate' | 'before-quit' | 'window-all-closed',
      listener: () => void,
    ): void => {
      if (event === 'activate') {
        app.on('activate', () => {
          listener();
        });
        return;
      }

      if (event === 'before-quit') {
        app.on('before-quit', () => {
          listener();
        });
        return;
      }

      app.on('window-all-closed', () => {
        listener();
      });
    },
    quit: (): void => {
      app.quit();
    },
  };

  registerAppLifecycleHandlers({
    app: lifecycleApp,
    isDarwin: process.platform === 'darwin',
    getWindowCount: () => BrowserWindow.getAllWindows().length,
    createMainWindow,
    destroyAllTerminals,
    closeDatabase: () => {
      terminalManager = null;
      closeDatabase();
    },
  });

  await createMainWindow();
};

app.whenReady()
  .then(() => bootstrap())
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    process.emitWarning(`Failed to bootstrap app: ${message}`);
    app.exit(1);
  });
