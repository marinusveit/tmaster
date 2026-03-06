import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { McpToolService } from '@main/mcp/McpServer';
import {
  createSession,
  createWorkspace,
  insertEvent,
  insertFileChange,
  upsertFileLock,
  updateSessionStatus,
} from '@main/db/queries';

const createTestDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

describe('McpToolService', () => {
  let db: InstanceType<typeof Database>;
  let service: McpToolService;

  beforeEach(() => {
    db = createTestDb();
    service = new McpToolService(db);
  });

  afterEach(() => {
    db.close();
  });

  const seedBaseData = (): void => {
    const now = Date.now();

    createWorkspace(db, 'ws1', 'Workspace 1', '/tmp/ws1', 1_000);
    createWorkspace(db, 'ws2', 'Workspace 2', '/tmp/ws2', 2_000);

    createSession(db, 's1', 't1', 'ws1', 'T', 1, 'claude --print', now - 8_000);
    createSession(db, 's2', 't2', 'ws1', 'T', 2, 'codex exec', now - 7_000);
    createSession(db, 's3', 't3', 'ws2', 'T', 1, 'pnpm dev', now - 6_000);

    updateSessionStatus(db, 't2', 'idle');

    insertEvent(db, 's1', now - 4 * 60_000, 'error', 'build failed', 'details-error');
    insertEvent(db, 's1', now - 3 * 60_000, 'warning', 'deprecated API', 'details-warning');
    insertEvent(db, 's2', now - 2 * 60_000, 'context_warning', 'context 85%', 'details-context');
    insertEvent(db, 's3', now - 1 * 60_000, 'error', 'tests failed', 'details-ws2');

    upsertFileLock(db, 'src/auth.ts', 't1', 'ws1', now - 2_000);
    upsertFileLock(db, 'src/auth.ts', 't2', 'ws1', now - 1_000);

    insertFileChange(db, 'src/auth.ts', 't1', 'ws1', now - 40_000, 'modify');
    insertFileChange(db, 'src/auth.ts', 't2', 'ws1', now - 20_000, 'modify');
    insertFileChange(db, 'src/router.ts', 't3', 'ws2', now - 10_000, 'create');
  };

  it('get_terminal_status gibt alle Terminals mit korrektem Status', () => {
    seedBaseData();

    const result = service.getTerminalStatus({ workspaceId: 'ws1' });

    expect(result).toHaveLength(2);
    expect(result[0]?.terminalId).toMatch(/t1|t2/);
    expect(result.map((item) => item.label)).toEqual(expect.arrayContaining(['T1', 'T2']));
    expect(result.map((item) => item.status)).toEqual(expect.arrayContaining(['active', 'idle']));
    expect(result.map((item) => item.agentType)).toEqual(expect.arrayContaining(['claude', 'codex']));
  });

  it('get_terminal_status filtert korrekt nach workspaceId', () => {
    seedBaseData();

    const result = service.getTerminalStatus({ workspaceId: 'ws2' });

    expect(result).toHaveLength(1);
    expect(result[0]?.terminalId).toBe('t3');
    expect(result[0]?.agentType).toBe('devserver');
  });

  it('get_terminal_errors gibt nur error-Events zurück', () => {
    seedBaseData();

    const result = service.getTerminalErrors({ sinceMinutes: 30 });

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.every((item) => item.summary.includes('failed'))).toBe(true);
  });

  it('get_terminal_errors filtert nach since_minutes', () => {
    const now = Date.now();
    createWorkspace(db, 'ws1', 'Workspace 1', '/tmp/ws1', 1_000);
    createSession(db, 's1', 't1', 'ws1', 'T', 1, null, now - 10_000);
    insertEvent(db, 's1', now - 45 * 60_000, 'error', 'old error', 'old');
    insertEvent(db, 's1', now - 5 * 60_000, 'error', 'recent error', 'recent');

    const result = service.getTerminalErrors({ sinceMinutes: 30 });

    expect(result).toHaveLength(1);
    expect(result[0]?.summary).toBe('recent error');
  });

  it('get_terminal_errors filtert auf terminalId', () => {
    seedBaseData();

    const result = service.getTerminalErrors({ terminalId: 't3', sinceMinutes: 30 });

    expect(result).toHaveLength(1);
    expect(result[0]?.terminalId).toBe('t3');
    expect(result[0]?.summary).toBe('tests failed');
  });

  it('get_workspace_context gibt lesbaren Kontext-String', () => {
    seedBaseData();

    const context = service.getWorkspaceContext({ workspaceId: 'ws1' });

    expect(context.length).toBeGreaterThan(20);
    expect(context).toContain('Aktive Fehler');
    expect(context).toContain('Konflikt');
  });

  it('get_workspace_context liefert bei leerer DB den Fallback-Text', () => {
    const context = service.getWorkspaceContext({ workspaceId: 'ws-does-not-exist' });
    expect(context).toBe('Keine aktiven Events');
  });

  it('get_file_conflicts gibt Konflikte mit mehr als einem Terminal zurück', () => {
    seedBaseData();

    const conflicts = service.getFileConflicts();

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.filePath).toBe('src/auth.ts');
    expect(conflicts[0]?.terminalIds).toEqual(expect.arrayContaining(['t1', 't2']));
  });

  it('get_file_conflicts liefert leeres Array wenn keine Konflikte existieren', () => {
    const conflicts = service.getFileConflicts();
    expect(conflicts).toEqual([]);
  });

  it('get_recent_changes gibt Dateiänderungen zurück', () => {
    seedBaseData();

    const changes = service.getRecentChanges({ sinceMinutes: 30 });

    expect(changes).toHaveLength(3);
    expect(changes[0]?.timestamp).toBeGreaterThanOrEqual(changes[1]?.timestamp ?? 0);
  });

  it('get_recent_changes filtert nach file_path', () => {
    seedBaseData();

    const changes = service.getRecentChanges({ filePath: 'src/auth.ts', sinceMinutes: 30 });

    expect(changes).toHaveLength(2);
    expect(changes.every((change) => change.filePath === 'src/auth.ts')).toBe(true);
  });

  it('get_hot_events sortiert nach Schwere (error > warning > info)', () => {
    const now = Date.now();
    createWorkspace(db, 'ws1', 'Workspace 1', '/tmp/ws1', 1_000);
    createSession(db, 's1', 't1', 'ws1', 'T', 1, null, now - 10_000);

    // Warning ist neuer, Error muss trotzdem zuerst kommen.
    insertEvent(db, 's1', now - 1 * 60_000, 'warning', 'new warning', null);
    insertEvent(db, 's1', now - 2 * 60_000, 'error', 'older error', null);

    const events = service.getHotEvents({ minutes: 5, workspaceId: 'ws1' });

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('error');
    expect(events[1]?.type).toBe('warning');
  });

  it('get_hot_events filtert nach minutes', () => {
    const now = Date.now();
    createWorkspace(db, 'ws1', 'Workspace 1', '/tmp/ws1', 1_000);
    createSession(db, 's1', 't1', 'ws1', 'T', 1, null, now - 10_000);

    insertEvent(db, 's1', now - 20 * 60_000, 'error', 'old error', null);
    insertEvent(db, 's1', now - 2 * 60_000, 'error', 'recent error', null);

    const events = service.getHotEvents({ minutes: 5, workspaceId: 'ws1' });

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('recent error');
  });

  it('DB read-only Modus funktioniert für MCP-Abfragen', () => {
    const dbPath = path.join(os.tmpdir(), `tmaster-mcp-${randomUUID()}.db`);

    const writableDb = new Database(dbPath);
    writableDb.pragma('journal_mode = WAL');
    writableDb.pragma('synchronous = NORMAL');
    writableDb.pragma('foreign_keys = ON');
    runMigrations(writableDb);

    const now = Date.now();
    createWorkspace(writableDb, 'ws-readonly', 'Readonly WS', '/tmp/ws-ro', 1_000);
    createSession(writableDb, 's-readonly', 't-readonly', 'ws-readonly', 'T', 1, null, now - 1_000);
    insertEvent(writableDb, 's-readonly', now - 500, 'error', 'readonly error', null);

    writableDb.close();

    const readOnlyDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    const readOnlyService = new McpToolService(readOnlyDb);

    const status = readOnlyService.getTerminalStatus({ workspaceId: 'ws-readonly' });
    expect(status).toHaveLength(1);
    expect(() => {
      readOnlyDb.prepare(
        "INSERT INTO workspaces (id, name, path, next_terminal_index, created_at) VALUES (?, ?, ?, 1, ?)",
      ).run('ws-write', 'Write', '/tmp/write', Date.now());
    }).toThrow();

    readOnlyDb.close();
    fs.rmSync(dbPath, { force: true });
  });
});
