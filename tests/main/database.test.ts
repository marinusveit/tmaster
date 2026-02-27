import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import {
  createWorkspace,
  listWorkspaces,
  createSession,
  updateSessionStatus,
  endSession,
  markOrphanedSessionsAsExited,
  incrementTerminalIndex,
} from '@main/db/queries';

const createTestDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

describe('SQLite Database', () => {
  let db: InstanceType<typeof Database>;

  afterEach(() => {
    db?.close();
  });

  it('erstellt Schema idempotent (doppelter Aufruf schlägt nicht fehl)', () => {
    db = createTestDb();
    // Zweiter Aufruf darf keinen Fehler werfen
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('workspaces');
    expect(tableNames).toContain('sessions');
  });

  it('erstellt und listet Workspaces', () => {
    db = createTestDb();

    createWorkspace(db, 'ws1', 'Project A', '/path/a', 1000);
    createWorkspace(db, 'ws2', 'Project B', '/path/b', 2000);

    const workspaces = listWorkspaces(db);
    expect(workspaces).toHaveLength(2);
    expect(workspaces[0]?.name).toBe('Project A');
    expect(workspaces[1]?.name).toBe('Project B');
  });

  it('erstellt Sessions und beendet sie korrekt', () => {
    db = createTestDb();

    createWorkspace(db, 'ws1', 'Test', '/test', Date.now());
    createSession(db, 'sess1', 'term1', 'ws1', 'T', 1, '/bin/bash', Date.now());

    // Status updaten
    updateSessionStatus(db, 'term1', 'idle');

    const sessions = db.prepare('SELECT * FROM sessions WHERE terminal_id = ?').all('term1') as Array<{
      status: string;
      ended_at: number | null;
    }>;
    expect(sessions[0]?.status).toBe('idle');
    expect(sessions[0]?.ended_at).toBeNull();

    // Session beenden
    endSession(db, 'term1');

    const endedSessions = db.prepare('SELECT * FROM sessions WHERE terminal_id = ?').all('term1') as Array<{
      status: string;
      ended_at: number | null;
    }>;
    expect(endedSessions[0]?.status).toBe('exited');
    expect(endedSessions[0]?.ended_at).not.toBeNull();
  });

  it('markiert verwaiste Sessions bei Crash-Recovery', () => {
    db = createTestDb();

    createWorkspace(db, 'ws1', 'Test', '/test', Date.now());
    createSession(db, 'sess1', 'term1', 'ws1', 'T', 1, null, Date.now());
    createSession(db, 'sess2', 'term2', 'ws1', 'T', 2, null, Date.now());

    const changed = markOrphanedSessionsAsExited(db);
    expect(changed).toBe(2);

    const sessions = db.prepare('SELECT * FROM sessions WHERE status = ?').all('exited') as Array<{
      ended_at: number | null;
    }>;
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.ended_at).not.toBeNull();
  });

  it('inkrementiert den Terminal-Index atomar', () => {
    db = createTestDb();

    createWorkspace(db, 'ws1', 'Test', '/test', Date.now());

    const idx1 = incrementTerminalIndex(db, 'ws1');
    const idx2 = incrementTerminalIndex(db, 'ws1');
    const idx3 = incrementTerminalIndex(db, 'ws1');

    expect(idx1).toBe(1);
    expect(idx2).toBe(2);
    expect(idx3).toBe(3);
  });

  it('erzwingt Foreign Key Constraint', () => {
    db = createTestDb();

    // Session mit nicht-existierendem Workspace muss fehlschlagen
    expect(() =>
      createSession(db, 'sess1', 'term1', 'nonexistent', 'T', 1, null, Date.now()),
    ).toThrow();
  });
});
