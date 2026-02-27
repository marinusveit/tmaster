import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { createWorkspace, createSession } from '@main/db/queries';
import { registerSessionHandlers } from '@main/ipc/registerSessionHandlers';
import type { SessionInfo } from '@shared/types/session';

const createTestDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

interface MockIpcMain {
  handle: ReturnType<typeof vi.fn>;
  handlers: Map<string, (event: unknown, payload: unknown) => unknown>;
}

const createMockIpcMain = (): MockIpcMain => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
      handlers.set(channel, handler);
    }),
  };
};

describe('registerSessionHandlers', () => {
  let db: InstanceType<typeof Database>;

  afterEach(() => {
    db?.close();
  });

  it('listet alle Sessions', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerSessionHandlers(ipcMain as unknown as Parameters<typeof registerSessionHandlers>[0], db);

    createWorkspace(db, 'ws1', 'Test', '/test', Date.now());
    createSession(db, 's1', 't1', 'ws1', 'T', 1, '/bin/bash', Date.now());
    createSession(db, 's2', 't2', 'ws1', 'T', 2, null, Date.now());

    const handler = ipcMain.handlers.get('session:list');
    expect(handler).toBeDefined();

    const result = handler!(null, {}) as { sessions: SessionInfo[] };
    expect(result.sessions).toHaveLength(2);
  });

  it('filtert Sessions nach Workspace', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerSessionHandlers(ipcMain as unknown as Parameters<typeof registerSessionHandlers>[0], db);

    createWorkspace(db, 'ws1', 'Test A', '/a', Date.now());
    createWorkspace(db, 'ws2', 'Test B', '/b', Date.now());
    createSession(db, 's1', 't1', 'ws1', 'T', 1, null, Date.now());
    createSession(db, 's2', 't2', 'ws2', 'T', 1, null, Date.now());
    createSession(db, 's3', 't3', 'ws1', 'T', 2, null, Date.now());

    const handler = ipcMain.handlers.get('session:list');
    const result = handler!(null, { workspaceId: 'ws1' }) as { sessions: SessionInfo[] };
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.every((s) => s.workspaceId === 'ws1')).toBe(true);
  });

  it('gibt leeres Array bei keinen Sessions zurueck', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerSessionHandlers(ipcMain as unknown as Parameters<typeof registerSessionHandlers>[0], db);

    const handler = ipcMain.handlers.get('session:list');
    const result = handler!(null, {}) as { sessions: SessionInfo[] };
    expect(result.sessions).toHaveLength(0);
  });

  it('mappt snake_case zu camelCase korrekt', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerSessionHandlers(ipcMain as unknown as Parameters<typeof registerSessionHandlers>[0], db);

    createWorkspace(db, 'ws1', 'Test', '/test', Date.now());
    createSession(db, 's1', 't1', 'ws1', 'T', 1, '/bin/bash', 1700000000000);

    const handler = ipcMain.handlers.get('session:list');
    const result = handler!(null, {}) as { sessions: SessionInfo[] };
    const session = result.sessions[0];

    expect(session).toBeDefined();
    expect(session?.terminalId).toBe('t1');
    expect(session?.workspaceId).toBe('ws1');
    expect(session?.labelPrefix).toBe('T');
    expect(session?.labelIndex).toBe(1);
    expect(session?.createdAt).toBe(1700000000000);
    expect(session?.endedAt).toBeNull();
    expect(session?.shell).toBe('/bin/bash');
  });
});
