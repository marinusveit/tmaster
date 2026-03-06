import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { EventType, TerminalEvent } from '../shared/types/event';
import { detectAgentType } from '../common/agent/detectAgentType';
import { TerminalManager } from './terminal/TerminalManager';
import { registerTerminalHandlers } from './ipc/registerTerminalHandlers';
import { registerWorkspaceHandlers } from './ipc/registerWorkspaceHandlers';
import { getDatabase, closeDatabase } from './db/database';
import { runMigrations } from './db/migrations';
import { registerAppLifecycleHandlers } from './lifecycle/registerAppLifecycleHandlers';
import { SecretFilter } from './security/secretFilter';
import { EventExtractor } from './events/eventExtractor';
import { registerSessionHandlers } from './ipc/registerSessionHandlers';
import { ContextBroker } from './broker/ContextBroker';
import { registerBrokerHandlers } from './ipc/registerBrokerHandlers';
import { FileWatcher } from './broker/FileWatcher';
import { RecommendationEngine, type TerminalState } from './assistant/RecommendationEngine';
import { registerAssistantHandlers } from './ipc/registerAssistantHandlers';
import { NotificationManager } from './notifications/NotificationManager';
import { registerNotificationHandlers } from './ipc/registerNotificationHandlers';
import { OutputRingBuffer, SilenceMonitor, TriageCoordinator, TriageService } from './triage';
import { mapTriageStatusToEventType } from './triage/mapTriageStatusToEventType';
import {
  listWorkspaces,
  createWorkspace,
  markOrphanedSessionsAsExited,
  createSession,
  endSession,
  getWorkspace,
  insertEvent,
  getActiveSessionId,
} from './db/queries';

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
let terminalManager: TerminalManager | null = null;
let recommendationEngine: RecommendationEngine | null = null;
let fileWatcher: FileWatcher | null = null;
const secretFilter = new SecretFilter({
  redactionMode: 'replace',
  customPatterns: [],
});
const eventExtractor = new EventExtractor();

const logInfo = (message: string): void => {
  process.stdout.write(`[tmaster] ${message}\n`);
};

const logError = (message: string, error: unknown): void => {
  const details = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[tmaster] ${message}\n${details}\n`);
};

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
  const activeWorkspaceBySenderId = new Map<number, string>();

  const setActiveWorkspaceForSender = (workspaceId: string, senderId?: number): void => {
    if (typeof senderId !== 'number') {
      return;
    }

    activeWorkspaceBySenderId.set(senderId, workspaceId);
  };

  const getActiveWorkspaceForSender = (senderId?: number): string => {
    if (typeof senderId === 'number') {
      return activeWorkspaceBySenderId.get(senderId) ?? defaultWorkspaceId;
    }

    const firstKnownWorkspace = activeWorkspaceBySenderId.values().next().value;
    return firstKnownWorkspace ?? defaultWorkspaceId;
  };

  const contextBroker = new ContextBroker(db);
  const notificationManager = new NotificationManager(
    db,
    broadcast,
    () => BrowserWindow.getFocusedWindow() !== null,
    () => {
      const focusedWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      focusedWindow?.focus();
    },
  );
  const outputRingBuffer = new OutputRingBuffer();
  const lastEventTypeByTerminal = new Map<string, EventType>();
  const agentTypeByTerminal = new Map<string, string>();
  const latestSessionIdByTerminal = new Map<string, string>();
  let isShuttingDown = false;

  // Triage-Verfügbarkeit VOR Terminal-Erstellung prüfen, damit kein
  // PTY-Output verloren geht während isAvailable() läuft.
  const triageService = new TriageService();
  const triageAvailable = await triageService.isAvailable();
  let triageCoordinator: TriageCoordinator | null = null;

  const silenceMonitor = new SilenceMonitor(
    (terminalId, trigger) => {
      triageCoordinator?.onSilence(terminalId, trigger)
        .catch((err: unknown) => { logError(`Triage silence failed for ${terminalId}`, err); });
    },
    (terminalId) => {
      triageCoordinator?.onOutputBurst(terminalId)
        .catch((err: unknown) => { logError(`Triage output burst failed for ${terminalId}`, err); });
    },
    (terminalId) => {
      const session = terminalManager?.getSession(terminalId);
      return session?.status === 'active';
    },
  );

  const terminalStateReader = (): Map<string, TerminalState> => {
    const sessions = terminalManager?.getSessions() ?? new Map();
    const states = new Map<string, TerminalState>();
    for (const [terminalId, session] of sessions) {
      states.set(terminalId, {
        terminalId,
        status: session.status,
        lastActivity: session.lastActivity,
        workspaceId: session.workspaceId,
      });
    }

    return states;
  };

  recommendationEngine = new RecommendationEngine(db, terminalStateReader, (suggestion) => {
    broadcast(IPC_CHANNELS.assistantSuggestion, suggestion);
  });

  fileWatcher = new FileWatcher(
    db,
    (conflict) => {
      broadcast(IPC_CHANNELS.brokerConflict, conflict);
    },
    (fileChangeEvent) => {
      broadcast(IPC_CHANNELS.brokerFileChange, fileChangeEvent);
    },
  );

  // Triage-Coordinator VOR dem TerminalManager erstellen,
  // damit kein PTY-Output während der Initialisierung verloren geht.
  if (triageAvailable) {
    triageCoordinator = new TriageCoordinator(
      triageService,
      (terminalId, lines) => outputRingBuffer.getRecent(terminalId, lines),
      (terminalId) => {
        const session = terminalManager?.getSession(terminalId);
        if (!session) {
          return null;
        }

        return {
          status: session.status,
          runtimeSeconds: Math.max(0, Math.floor((Date.now() - session.createdAt) / 1000)),
          lastEventType: lastEventTypeByTerminal.get(terminalId),
        };
      },
      (terminalId) => agentTypeByTerminal.get(terminalId) ?? 'generic',
      (terminalId, result) => {
        if (isShuttingDown) {
          return;
        }

        const triageEventType = mapTriageStatusToEventType(result.status);
        if (!triageEventType) {
          return;
        }

        const triageEvent: TerminalEvent = {
          terminalId,
          timestamp: Date.now(),
          type: triageEventType,
          summary: result.summary,
          details: result.detail,
          source: 'llm_triage',
        };

        lastEventTypeByTerminal.set(terminalId, triageEvent.type);

        const sessionId = getActiveSessionId(db, terminalId) ?? latestSessionIdByTerminal.get(terminalId);
        if (sessionId) {
          insertEvent(
            db,
            sessionId,
            triageEvent.timestamp,
            triageEvent.type,
            triageEvent.summary,
            triageEvent.details ?? null,
          );
        }

        contextBroker.onEvent(triageEvent);
        recommendationEngine?.onEvent(triageEvent);
        notificationManager.onTerminalEvent(triageEvent);
        broadcast(IPC_CHANNELS.terminalEvent, triageEvent);

        if (result.status === 'action_required') {
          const workspaceId = terminalManager?.getSession(terminalId)?.workspaceId;
          notificationManager.notify({
            title: `${terminalId} wartet auf Entscheidung`,
            body: result.detail ?? result.summary,
            level: result.urgency === 'critical' ? 'error' : 'warning',
            terminalId,
            workspaceId,
          });
        }
      },
    );
  } else {
    logInfo('LLM-Triage deaktiviert: claude CLI nicht gefunden');
  }

  terminalManager = new TerminalManager({
    onData: (event) => {
      const redactedData = secretFilter.redact(event.data);
      if (!redactedData) {
        return;
      }

      if (isShuttingDown) {
        return;
      }

      outputRingBuffer.append(event.terminalId, redactedData);
      silenceMonitor.onOutput(event.terminalId);

      // Event-Pipeline: Extract -> DB -> broadcast events
      const events = eventExtractor.extract(event.terminalId, redactedData);
      for (const extractedEvent of events) {
        lastEventTypeByTerminal.set(event.terminalId, extractedEvent.type);
        const sessionId = getActiveSessionId(db, event.terminalId);
        if (sessionId) {
          insertEvent(db, sessionId, extractedEvent.timestamp, extractedEvent.type, extractedEvent.summary, extractedEvent.details ?? null);
        }
        contextBroker.onEvent(extractedEvent);
        recommendationEngine?.onEvent(extractedEvent);
        notificationManager.onTerminalEvent(extractedEvent);
        broadcast(IPC_CHANNELS.terminalEvent, extractedEvent);
        triageCoordinator?.onRegexCandidate(event.terminalId, extractedEvent)
          .catch((err: unknown) => { logError(`Triage regex candidate failed for ${event.terminalId}`, err); });
      }

      broadcast(IPC_CHANNELS.terminalData, { ...event, data: redactedData });
    },
    onExit: (event) => {
      const processExitPromise = !isShuttingDown
        ? triageCoordinator?.onProcessExit(event.terminalId, event.exitCode ?? -1)
        : undefined;
      if (processExitPromise) {
        void processExitPromise
          .catch((error: unknown) => {
            if (!isShuttingDown) {
              logError(`LLM-Triage for exited terminal ${event.terminalId} failed`, error);
            }
          })
          .finally(() => {
            latestSessionIdByTerminal.delete(event.terminalId);
          });
      } else {
        latestSessionIdByTerminal.delete(event.terminalId);
      }

      outputRingBuffer.remove(event.terminalId);
      silenceMonitor.removeTerminal(event.terminalId);
      lastEventTypeByTerminal.delete(event.terminalId);
      agentTypeByTerminal.delete(event.terminalId);

      // Session in DB nur beenden solange die Datenbank noch offen ist.
      if (!isShuttingDown) {
        endSession(db, event.terminalId);
      }
      fileWatcher?.releaseTerminalLocks(event.terminalId);
      notificationManager.onTerminalExit(event.terminalId, event.exitCode ?? -1);
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
    latestSessionIdByTerminal.set(response.terminalId, sessionId);
    agentTypeByTerminal.set(response.terminalId, detectAgentType(request.shell));

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
  registerWorkspaceHandlers(ipcMain, db, (workspaceId, senderId) => {
    setActiveWorkspaceForSender(workspaceId, senderId);
  });
  registerSessionHandlers(ipcMain, db);
  registerBrokerHandlers(ipcMain, contextBroker);
  registerAssistantHandlers(ipcMain, {
    contextBroker,
    createTerminal: (request) => {
      if (!terminalManager) {
        throw new Error('Terminal manager is not available');
      }
      return terminalManager.createTerminal(request);
    },
    writeTerminal: (terminalId, data) => {
      if (!terminalManager) {
        throw new Error('Terminal manager is not available');
      }
      terminalManager.writeTerminal(terminalId, data);
    },
    getActiveWorkspaceId: (senderId) => getActiveWorkspaceForSender(senderId),
    onAssistantMessage: (message) => {
      broadcast(IPC_CHANNELS.assistantMessage, message);
    },
  });
  registerNotificationHandlers(ipcMain, notificationManager);

  recommendationEngine.start();
  silenceMonitor.start();

  for (const workspace of listWorkspaces(db)) {
    fileWatcher.watch(workspace.id, workspace.path);
  }

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
      isShuttingDown = true;
      silenceMonitor.dispose();
      outputRingBuffer.clear();
      triageCoordinator?.dispose();
      triageCoordinator = null;
      activeWorkspaceBySenderId.clear();
      lastEventTypeByTerminal.clear();
      agentTypeByTerminal.clear();
      latestSessionIdByTerminal.clear();
      recommendationEngine?.dispose();
      recommendationEngine = null;
      fileWatcher?.unwatchAll();
      fileWatcher = null;
      terminalManager?.dispose();
      terminalManager = null;
      closeDatabase();
    },
  });

  await createMainWindow();
};

app.whenReady()
  .then(() => bootstrap())
  .catch((error: unknown) => {
    logError('Failed to bootstrap app', error);
    app.exit(1);
  });
