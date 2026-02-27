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
  insertEvent,
  listEventsBySession,
  listRecentEvents,
  getActiveSessionId,
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

  // --- Event Queries ---

  it('erstellt session_events Tabelle', () => {
    db = createTestDb();

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(tables.map((t) => t.name)).toContain('session_events');
  });

  it('speichert und listet Events pro Session', () => {
    db = createTestDb();

    createWorkspace(db, 'ws1', 'Test', '/test', Date.now());
    createSession(db, 'sess1', 'term1', 'ws1', 'T', 1, null, Date.now());

    insertEvent(db, 'sess1', 1000, 'error', 'Cannot find module', 'Error details...');
    insertEvent(db, 'sess1', 2000, 'warning', 'Deprecated API', null);

    const events = listEventsBySession(db, 'sess1');
    expect(events).toHaveLength(2);
    expect(events[0]?.event_type).toBe('error');
    expect(events[0]?.summary).toBe('Cannot find module');
    expect(events[1]?.event_type).toBe('warning');
    expect(events[1]?.details).toBeNull();
  });

  it('listet letzte Events ueber alle Sessions', () => {
    db = createTestDb();

    createWorkspace(db, 'ws1', 'Test', '/test', Date.now());
    createSession(db, 'sess1', 'term1', 'ws1', 'T', 1, null, Date.now());
    createSession(db, 'sess2', 'term2', 'ws1', 'T', 2, null, Date.now());

    insertEvent(db, 'sess1', 1000, 'error', 'Error 1', null);
    insertEvent(db, 'sess2', 2000, 'warning', 'Warning 1', null);
    insertEvent(db, 'sess1', 3000, 'error', 'Error 2', null);

    const recent = listRecentEvents(db, 2);
    expect(recent).toHaveLength(2);
    // Sortiert nach timestamp DESC
    expect(recent[0]?.summary).toBe('Error 2');
    expect(recent[1]?.summary).toBe('Warning 1');
  });

  it('findet aktive Session-ID anhand Terminal-ID', () => {
    db = createTestDb();

    createWorkspace(db, 'ws1', 'Test', '/test', Date.now());
    createSession(db, 'sess1', 'term1', 'ws1', 'T', 1, null, Date.now());

    const sessionId = getActiveSessionId(db, 'term1');
    expect(sessionId).toBe('sess1');

    // Beendete Session wird nicht gefunden
    endSession(db, 'term1');
    const noSessionId = getActiveSessionId(db, 'term1');
    expect(noSessionId).toBeNull();
  });

  it('gibt null zurueck wenn keine aktive Session existiert', () => {
    db = createTestDb();

    const sessionId = getActiveSessionId(db, 'nonexistent');
    expect(sessionId).toBeNull();
  });
});
