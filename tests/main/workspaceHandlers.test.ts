import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { registerWorkspaceHandlers } from '@main/ipc/registerWorkspaceHandlers';
import { createWorkspace, listWorkspaces } from '@main/db/queries';
import type { TerminalSessionInfo } from '@shared/types/terminal';

type HandlerFn = (event: unknown, payload: unknown) => unknown;

const createTestDb = () => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

const createMockIpcMain = () => {
  const handlers = new Map<string, HandlerFn>();
  return {
    handle: vi.fn((channel: string, handler: HandlerFn) => {
      handlers.set(channel, handler);
    }),
    invoke: (channel: string, payload: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler for ${channel}`);
      }
      return handler(null, payload);
    },
  };
};

const createTerminalInfo = (terminalId: string, workspaceId: string): TerminalSessionInfo => ({
  terminalId,
  label: { prefix: 'T', index: 1 },
  workspaceId,
  status: 'active',
  createdAt: Date.now(),
});

const createMockTerminalManager = (terminals: TerminalSessionInfo[] = []) => {
  return {
    listTerminals: vi.fn(() => terminals),
    closeTerminal: vi.fn(),
  };
};

describe('registerWorkspaceHandlers', () => {
  let db: InstanceType<typeof Database>;

  afterEach(() => {
    db?.close();
  });

  it('erstellt einen Workspace über IPC', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    const terminalManager = createMockTerminalManager();
    registerWorkspaceHandlers(ipcMain as never, db, terminalManager);

    const result = ipcMain.invoke('workspace:create', { name: 'My Project', path: '/home/user/project' }) as {
      id: string;
      name: string;
      path: string;
    };

    expect(result.name).toBe('My Project');
    expect(result.path).toBe('/home/user/project');
    expect(result.id).toBeTruthy();
  });

  it('listet alle Workspaces', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    const terminalManager = createMockTerminalManager();
    registerWorkspaceHandlers(ipcMain as never, db, terminalManager);

    createWorkspace(db, 'ws1', 'A', '/a', Date.now());
    createWorkspace(db, 'ws2', 'B', '/b', Date.now());

    const result = ipcMain.invoke('workspace:list', undefined) as {
      workspaces: Array<{ id: string; name: string }>;
    };

    expect(result.workspaces).toHaveLength(2);
  });

  it('wirft bei ungültigem Create-Payload', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    const terminalManager = createMockTerminalManager();
    registerWorkspaceHandlers(ipcMain as never, db, terminalManager);

    expect(() => ipcMain.invoke('workspace:create', { name: 'No Path' })).toThrow(
      'Workspace name and path are required',
    );
  });

  it('updated einen Workspace', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    const terminalManager = createMockTerminalManager();
    registerWorkspaceHandlers(ipcMain as never, db, terminalManager);

    createWorkspace(db, 'ws1', 'Original', '/orig', Date.now());

    const result = ipcMain.invoke('workspace:update', { id: 'ws1', name: 'Updated' }) as {
      name: string;
    };

    expect(result.name).toBe('Updated');

    const rows = listWorkspaces(db);
    expect(rows[0]?.name).toBe('Updated');
  });

  it('wirft bei Switch zu nicht-existierendem Workspace', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    const terminalManager = createMockTerminalManager();
    registerWorkspaceHandlers(ipcMain as never, db, terminalManager);

    expect(() => ipcMain.invoke('workspace:switch', 'nonexistent')).toThrow('not found');
    expect(terminalManager.closeTerminal).not.toHaveBeenCalled();
  });

  it('beendet alle PTYs außerhalb des Ziel-Workspaces beim Switch', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    const terminalManager = createMockTerminalManager([
      createTerminalInfo('t-ws-a', 'ws-a'),
      createTerminalInfo('t-ws-b', 'ws-b'),
      createTerminalInfo('t-ws-c', 'ws-c'),
    ]);
    registerWorkspaceHandlers(ipcMain as never, db, terminalManager);

    createWorkspace(db, 'ws-a', 'A', '/a', Date.now());
    createWorkspace(db, 'ws-b', 'B', '/b', Date.now());
    createWorkspace(db, 'ws-c', 'C', '/c', Date.now());

    ipcMain.invoke('workspace:switch', 'ws-b');

    expect(terminalManager.listTerminals).toHaveBeenCalledTimes(1);
    expect(terminalManager.closeTerminal).toHaveBeenCalledTimes(2);
    expect(terminalManager.closeTerminal).toHaveBeenNthCalledWith(1, 't-ws-a');
    expect(terminalManager.closeTerminal).toHaveBeenNthCalledWith(2, 't-ws-c');
  });
});
