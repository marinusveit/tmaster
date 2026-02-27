import type BetterSqlite3 from 'better-sqlite3';

// --- Workspace Queries ---

interface WorkspaceRow {
  id: string;
  name: string;
  path: string;
  next_terminal_index: number;
  created_at: number;
}

export const createWorkspace = (
  db: BetterSqlite3.Database,
  id: string,
  name: string,
  workspacePath: string,
  createdAt: number,
): WorkspaceRow => {
  db.prepare(
    'INSERT INTO workspaces (id, name, path, next_terminal_index, created_at) VALUES (?, ?, ?, 1, ?)',
  ).run(id, name, workspacePath, createdAt);

  return { id, name, path: workspacePath, next_terminal_index: 1, created_at: createdAt };
};

export const listWorkspaces = (db: BetterSqlite3.Database): WorkspaceRow[] => {
  return db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all() as WorkspaceRow[];
};

export const getWorkspace = (db: BetterSqlite3.Database, id: string): WorkspaceRow | undefined => {
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined;
};

export const updateWorkspace = (
  db: BetterSqlite3.Database,
  id: string,
  updates: { name?: string; path?: string },
): void => {
  if (updates.name !== undefined) {
    db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(updates.name, id);
  }

  if (updates.path !== undefined) {
    db.prepare('UPDATE workspaces SET path = ? WHERE id = ?').run(updates.path, id);
  }
};

/**
 * Inkrementiert next_terminal_index atomar und gibt den alten Wert zurück.
 */
export const incrementTerminalIndex = (db: BetterSqlite3.Database, workspaceId: string): number => {
  const row = db
    .prepare('UPDATE workspaces SET next_terminal_index = next_terminal_index + 1 WHERE id = ? RETURNING next_terminal_index - 1 AS idx')
    .get(workspaceId) as { idx: number } | undefined;

  if (!row) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  return row.idx;
};

// --- Session Queries ---

interface SessionRow {
  id: string;
  terminal_id: string;
  workspace_id: string;
  label_prefix: string;
  label_index: number;
  status: string;
  created_at: number;
  ended_at: number | null;
  shell: string | null;
}

export const createSession = (
  db: BetterSqlite3.Database,
  id: string,
  terminalId: string,
  workspaceId: string,
  labelPrefix: string,
  labelIndex: number,
  shell: string | null,
  createdAt: number,
): void => {
  db.prepare(
    'INSERT INTO sessions (id, terminal_id, workspace_id, label_prefix, label_index, status, created_at, shell) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, terminalId, workspaceId, labelPrefix, labelIndex, 'active', createdAt, shell);
};

export const updateSessionStatus = (
  db: BetterSqlite3.Database,
  terminalId: string,
  status: string,
): void => {
  db.prepare('UPDATE sessions SET status = ? WHERE terminal_id = ? AND ended_at IS NULL').run(
    status,
    terminalId,
  );
};

export const endSession = (db: BetterSqlite3.Database, terminalId: string): void => {
  const now = Date.now();
  db.prepare(
    'UPDATE sessions SET status = ?, ended_at = ? WHERE terminal_id = ? AND ended_at IS NULL',
  ).run('exited', now, terminalId);
};

export const listSessions = (db: BetterSqlite3.Database, workspaceId?: string): SessionRow[] => {
  if (workspaceId) {
    return db
      .prepare('SELECT * FROM sessions WHERE workspace_id = ? ORDER BY created_at ASC')
      .all(workspaceId) as SessionRow[];
  }

  return db.prepare('SELECT * FROM sessions ORDER BY created_at ASC').all() as SessionRow[];
};

// --- Event Queries ---

export const insertEvent = (
  db: BetterSqlite3.Database,
  sessionId: string,
  timestamp: number,
  eventType: string,
  summary: string,
  details: string | null,
): void => {
  db.prepare(
    'INSERT INTO session_events (session_id, timestamp, event_type, summary, details) VALUES (?, ?, ?, ?, ?)',
  ).run(sessionId, timestamp, eventType, summary, details ?? null);
};

export const listEventsBySession = (
  db: BetterSqlite3.Database,
  sessionId: string,
): Array<{ id: number; session_id: string; timestamp: number; event_type: string; summary: string; details: string | null }> => {
  return db
    .prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY timestamp ASC')
    .all(sessionId) as Array<{ id: number; session_id: string; timestamp: number; event_type: string; summary: string; details: string | null }>;
};

export const listRecentEvents = (
  db: BetterSqlite3.Database,
  limit: number = 50,
): Array<{ id: number; session_id: string; timestamp: number; event_type: string; summary: string; details: string | null }> => {
  return db
    .prepare('SELECT * FROM session_events ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as Array<{ id: number; session_id: string; timestamp: number; event_type: string; summary: string; details: string | null }>;
};

export const getActiveSessionId = (
  db: BetterSqlite3.Database,
  terminalId: string,
): string | null => {
  const row = db
    .prepare("SELECT id FROM sessions WHERE terminal_id = ? AND status = 'active' LIMIT 1")
    .get(terminalId) as { id: string } | undefined;

  return row?.id ?? null;
};

/**
 * Markiert verwaiste Sessions (ohne ended_at) als 'exited' — Crash-Recovery.
 */
export const markOrphanedSessionsAsExited = (db: BetterSqlite3.Database): number => {
  const now = Date.now();
  const result = db
    .prepare("UPDATE sessions SET status = 'exited', ended_at = ? WHERE ended_at IS NULL")
    .run(now);
  return result.changes;
};
