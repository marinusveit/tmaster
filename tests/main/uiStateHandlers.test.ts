import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { registerUiStateHandlers } from '@main/ipc/registerUiStateHandlers';
import { createWorkspace } from '@main/db/queries';
import { IPC_CHANNELS } from '@shared/ipc-channels';

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
    invoke: (channel: string, payload?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler for ${channel}`);
      }

      return handler(null, payload);
    },
  };
};

describe('registerUiStateHandlers', () => {
  let db: InstanceType<typeof Database>;

  afterEach(() => {
    db?.close();
  });

  it('liefert Default-UI-State via IPC', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerUiStateHandlers(ipcMain as never, db);

    expect(ipcMain.invoke(IPC_CHANNELS.uiStateGet)).toEqual({
      activeWorkspaceId: null,
      activeTerminalId: null,
      splitMode: 'single',
      splitRatio: 0.5,
    });
  });

  it('persistiert UI-State via IPC und clampt Split-Ratio', () => {
    db = createTestDb();
    createWorkspace(db, 'ws-1', 'Alpha', '/alpha', Date.now());
    const ipcMain = createMockIpcMain();
    registerUiStateHandlers(ipcMain as never, db);

    const result = ipcMain.invoke(IPC_CHANNELS.uiStateSave, {
      activeWorkspaceId: 'ws-1',
      activeTerminalId: 'term-1',
      splitMode: 'horizontal',
      splitRatio: 0.95,
    });

    expect(result).toEqual({
      activeWorkspaceId: 'ws-1',
      activeTerminalId: 'term-1',
      splitMode: 'horizontal',
      splitRatio: 0.8,
    });
  });

  it('wirft bei unbekanntem Workspace', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerUiStateHandlers(ipcMain as never, db);

    expect(() => ipcMain.invoke(IPC_CHANNELS.uiStateSave, {
      activeWorkspaceId: 'ws-missing',
    })).toThrow('Workspace ws-missing not found');
  });

  it('wirft bei ungültigem Split-Modus', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerUiStateHandlers(ipcMain as never, db);

    expect(() => ipcMain.invoke(IPC_CHANNELS.uiStateSave, {
      splitMode: 'triple',
    })).toThrow('Invalid split mode');
  });

  it('wirft bei leeren IDs', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerUiStateHandlers(ipcMain as never, db);

    expect(() => ipcMain.invoke(IPC_CHANNELS.uiStateSave, {
      activeTerminalId: '',
    })).toThrow('Invalid active terminal ID');
  });
});
