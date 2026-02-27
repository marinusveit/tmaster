import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { ContextBroker } from '@main/broker/ContextBroker';
import {
  createSession,
  createWorkspace,
  insertEvent,
  upsertFileLock,
} from '@main/db/queries';
import type { TerminalEvent } from '@shared/types/event';

const createTestDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

describe('ContextBroker', () => {
  let db: InstanceType<typeof Database>;
  let contextBroker: ContextBroker;

  beforeEach(() => {
    db = createTestDb();
    contextBroker = new ContextBroker(db);

    const now = Date.now();

    createWorkspace(db, 'ws1', 'Workspace 1', '/tmp/ws1', 1000);
    createWorkspace(db, 'ws2', 'Workspace 2', '/tmp/ws2', 1000);

    createSession(db, 's1', 't1', 'ws1', 'T', 1, null, 1000);
    createSession(db, 's2', 't2', 'ws1', 'T', 2, null, 1000);
    createSession(db, 's3', 't3', 'ws2', 'T', 1, null, 1000);

    // Timestamps muessen innerhalb des 10-Minuten-Fensters von buildPromptContext liegen
    insertEvent(db, 's1', now - 60_000, 'error', 'build failed', 'details-a');
    insertEvent(db, 's1', now - 50_000, 'warning', 'deprecated', 'details-b');
    insertEvent(db, 's2', now - 40_000, 'context_warning', 'context window at 85%', 'details-c');
    insertEvent(db, 's3', now - 30_000, 'error', 'ws2 failed', 'details-d');

    upsertFileLock(db, 'src/auth.ts', 't1', 'ws1', 9000);
    upsertFileLock(db, 'src/auth.ts', 't2', 'ws1', 9100);
  });

  afterEach(() => {
    db.close();
  });

  it('filtert getContext nach workspaceId und eventTypes', () => {
    const result = contextBroker.getContext({ workspaceId: 'ws1', eventTypes: ['error'] });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.terminalId).toBe('t1');
    expect(result.events[0]?.type).toBe('error');
    expect(result.conflicts).toHaveLength(1);
  });

  it('filtert getContext nach since und limit', () => {
    const since = Date.now() - 45_000;
    const result = contextBroker.getContext({ since, limit: 2 });
    expect(result.events).toHaveLength(2);
    expect(result.events[0]?.timestamp).toBeGreaterThanOrEqual(since);
  });

  it('liefert ohne Filter alle Events', () => {
    const result = contextBroker.getContext({});
    expect(result.events.length).toBeGreaterThanOrEqual(4);
    expect(result.activeTerminals).toBe(3);
  });

  it('buildPromptContext erzeugt lesbaren String', () => {
    const text = contextBroker.buildPromptContext('ws1');
    expect(text).toContain('Aktive Fehler');
    expect(text).toContain('Warnings');
  });

  it('getHotEvents filtert nach Zeitfenster und Schwere', () => {
    const oldEvent: TerminalEvent = {
      terminalId: 't1',
      timestamp: Date.now() - (20 * 60 * 1000),
      type: 'warning',
      summary: 'old warning',
      source: 'pattern',
    };

    const hotError: TerminalEvent = {
      terminalId: 't1',
      timestamp: Date.now() - (2 * 60 * 1000),
      type: 'error',
      summary: 'new error',
      source: 'pattern',
    };

    contextBroker.onEvent(oldEvent);
    contextBroker.onEvent(hotError);

    const hotEvents = contextBroker.getHotEvents('ws1', 5);
    expect(hotEvents).toHaveLength(1);
    expect(hotEvents[0]?.type).toBe('error');
  });

  it('onEvent aktualisiert internen Zustand', () => {
    const event: TerminalEvent = {
      terminalId: 't2',
      timestamp: Date.now(),
      type: 'warning',
      summary: 'new warning',
      source: 'pattern',
    };

    contextBroker.onEvent(event);
    const hotEvents = contextBroker.getHotEvents('ws1', 5);
    expect(hotEvents.some((item) => item.summary === 'new warning')).toBe(true);
  });

  it('liefert leeres Ergebnis bei leerer DB', () => {
    const emptyDb = createTestDb();
    const emptyBroker = new ContextBroker(emptyDb);

    const result = emptyBroker.getContext({});
    expect(result.events).toHaveLength(0);
    expect(result.activeTerminals).toBe(0);
    expect(result.recentErrors).toBe(0);

    emptyDb.close();
  });
});
