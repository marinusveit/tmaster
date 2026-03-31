import type BetterSqlite3 from 'better-sqlite3';
import {
  DEFAULT_SPLIT_MODE,
  DEFAULT_SPLIT_RATIO,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
} from '../../shared/constants/defaults';
import type { SaveUiStateRequest, SplitMode, UiState, WindowState } from '../../shared/types/uiState';

// --- Workspace Queries ---

interface WorkspaceRow {
  id: string;
  name: string;
  path: string;
  next_terminal_index: number;
  created_at: number;
}

interface WindowStateRow {
  window_key: string;
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  is_maximized: number;
}

interface UiStateRow {
  state_key: string;
  active_workspace_id: string | null;
  active_terminal_id: string | null;
  split_mode: SplitMode;
  split_ratio: number;
  updated_at: number;
}

const MAIN_WINDOW_KEY = 'main';
const MAIN_UI_STATE_KEY = 'main';

const clampSplitRatio = (ratio: number): number => {
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
};

const toWindowState = (row?: WindowStateRow): WindowState => {
  if (!row) {
    return {
      x: null,
      y: null,
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      isMaximized: false,
    };
  }

  return {
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    isMaximized: row.is_maximized === 1,
  };
};

const toUiState = (row?: UiStateRow): UiState => {
  if (!row) {
    return {
      activeWorkspaceId: null,
      activeTerminalId: null,
      splitMode: DEFAULT_SPLIT_MODE,
      splitRatio: DEFAULT_SPLIT_RATIO,
    };
  }

  return {
    activeWorkspaceId: row.active_workspace_id,
    activeTerminalId: row.active_terminal_id,
    splitMode: row.split_mode,
    splitRatio: clampSplitRatio(row.split_ratio),
  };
};

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

export const getWindowState = (db: BetterSqlite3.Database): WindowState => {
  const row = db
    .prepare('SELECT * FROM window_state WHERE window_key = ?')
    .get(MAIN_WINDOW_KEY) as WindowStateRow | undefined;

  return toWindowState(row);
};

export const saveWindowState = (
  db: BetterSqlite3.Database,
  state: WindowState,
): WindowState => {
  db.prepare(
    `INSERT INTO window_state (window_key, x, y, width, height, is_maximized)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(window_key) DO UPDATE SET
       x = excluded.x,
       y = excluded.y,
       width = excluded.width,
       height = excluded.height,
       is_maximized = excluded.is_maximized`,
  ).run(
    MAIN_WINDOW_KEY,
    state.x,
    state.y,
    state.width,
    state.height,
    state.isMaximized ? 1 : 0,
  );

  return getWindowState(db);
};

export const getUiState = (db: BetterSqlite3.Database): UiState => {
  const row = db
    .prepare('SELECT * FROM ui_state WHERE state_key = ?')
    .get(MAIN_UI_STATE_KEY) as UiStateRow | undefined;

  return toUiState(row);
};

export const saveUiState = (
  db: BetterSqlite3.Database,
  request: SaveUiStateRequest,
): UiState => {
  const currentState = getUiState(db);
  const nextState: UiState = {
    activeWorkspaceId: request.activeWorkspaceId === undefined
      ? currentState.activeWorkspaceId
      : request.activeWorkspaceId,
    activeTerminalId: request.activeTerminalId === undefined
      ? currentState.activeTerminalId
      : request.activeTerminalId,
    splitMode: request.splitMode ?? currentState.splitMode,
    splitRatio: request.splitRatio === undefined
      ? currentState.splitRatio
      : clampSplitRatio(request.splitRatio),
  };

  db.prepare(
    `INSERT INTO ui_state (
      state_key,
      active_workspace_id,
      active_terminal_id,
      split_mode,
      split_ratio,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(state_key) DO UPDATE SET
      active_workspace_id = excluded.active_workspace_id,
      active_terminal_id = excluded.active_terminal_id,
      split_mode = excluded.split_mode,
      split_ratio = excluded.split_ratio,
      updated_at = excluded.updated_at`,
  ).run(
    MAIN_UI_STATE_KEY,
    nextState.activeWorkspaceId,
    nextState.activeTerminalId,
    nextState.splitMode,
    nextState.splitRatio,
    Date.now(),
  );

  return getUiState(db);
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
  display_order: number;
  status: string;
  created_at: number;
  ended_at: number | null;
  shell: string | null;
}

export interface KeybindingRow {
  action: string;
  shortcut: string;
  updated_at: number;
}

export interface EventRow {
  id: number;
  session_id: string;
  timestamp: number;
  event_type: string;
  summary: string;
  details: string | null;
}

export interface WorkspaceEventRow extends EventRow {
  workspace_id: string;
  terminal_id: string;
}

export interface FileLockRow {
  file_path: string;
  terminal_id: string;
  workspace_id: string;
  locked_at: number;
}

export interface FileChangeRow {
  file_path: string;
  terminal_id: string;
  workspace_id: string;
  timestamp: number;
  change_type: 'create' | 'modify' | 'delete';
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  level: string;
  terminal_id: string | null;
  workspace_id: string | null;
  timestamp: number;
  is_read: number;
}

export interface PreferenceRow {
  key: string;
  value: string;
  updated_at: number;
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
  displayOrder: number = labelIndex,
): void => {
  db.prepare(
    'INSERT INTO sessions (id, terminal_id, workspace_id, label_prefix, label_index, display_order, status, created_at, shell) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, terminalId, workspaceId, labelPrefix, labelIndex, displayOrder, 'active', createdAt, shell);
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
      .prepare('SELECT * FROM sessions WHERE workspace_id = ? ORDER BY display_order ASC, created_at ASC')
      .all(workspaceId) as SessionRow[];
  }

  return db.prepare('SELECT * FROM sessions ORDER BY display_order ASC, created_at ASC').all() as SessionRow[];
};

export const updateSessionDisplayOrders = (
  db: BetterSqlite3.Database,
  workspaceId: string,
  orderedTerminalIds: string[],
): void => {
  const updateDisplayOrder = db.prepare(
    'UPDATE sessions SET display_order = ? WHERE terminal_id = ? AND workspace_id = ? AND ended_at IS NULL',
  );

  db.transaction((terminalIds: string[]) => {
    terminalIds.forEach((terminalId, index) => {
      updateDisplayOrder.run(index + 1, terminalId, workspaceId);
    });
  })(orderedTerminalIds);
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
): EventRow[] => {
  return db
    .prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY timestamp ASC')
    .all(sessionId) as EventRow[];
};

export const listRecentEvents = (
  db: BetterSqlite3.Database,
  limit: number = 50,
): EventRow[] => {
  return db
    .prepare('SELECT * FROM session_events ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as EventRow[];
};

export const listEventsByType = (
  db: BetterSqlite3.Database,
  eventType: string,
  limit: number,
): EventRow[] => {
  return db
    .prepare(
      'SELECT * FROM session_events WHERE event_type = ? ORDER BY timestamp DESC LIMIT ?',
    )
    .all(eventType, limit) as EventRow[];
};

export const listRecentEventsByWorkspace = (
  db: BetterSqlite3.Database,
  workspaceId: string,
  since: number,
  limit: number,
): WorkspaceEventRow[] => {
  return db
    .prepare(
      `SELECT
        e.id,
        e.session_id,
        e.timestamp,
        e.event_type,
        e.summary,
        e.details,
        s.workspace_id,
        s.terminal_id
      FROM session_events e
      JOIN sessions s ON s.id = e.session_id
      WHERE s.workspace_id = ? AND e.timestamp >= ?
      ORDER BY e.timestamp DESC
      LIMIT ?`,
    )
    .all(workspaceId, since, limit) as WorkspaceEventRow[];
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

export const upsertFileLock = (
  db: BetterSqlite3.Database,
  filePath: string,
  terminalId: string,
  workspaceId: string,
  timestamp: number,
): void => {
  db.prepare(
    `INSERT OR REPLACE INTO file_locks (file_path, terminal_id, workspace_id, locked_at)
     VALUES (?, ?, ?, ?)`,
  ).run(filePath, terminalId, workspaceId, timestamp);
};

export const removeFileLock = (
  db: BetterSqlite3.Database,
  filePath: string,
  terminalId: string,
): void => {
  db.prepare('DELETE FROM file_locks WHERE file_path = ? AND terminal_id = ?').run(
    filePath,
    terminalId,
  );
};

export const removeAllFileLocksForTerminal = (
  db: BetterSqlite3.Database,
  terminalId: string,
): void => {
  db.prepare('DELETE FROM file_locks WHERE terminal_id = ?').run(terminalId);
};

export const getFileLocksForWorkspace = (
  db: BetterSqlite3.Database,
  workspaceId: string,
): FileLockRow[] => {
  return db
    .prepare(
      'SELECT * FROM file_locks WHERE workspace_id = ? ORDER BY locked_at DESC, file_path ASC',
    )
    .all(workspaceId) as FileLockRow[];
};

export interface ConflictingFileRow {
  file_path: string;
  terminal_ids: string;
  lock_count: number;
}

export const getConflictingFiles = (
  db: BetterSqlite3.Database,
  workspaceId: string,
): ConflictingFileRow[] => {
  return db
    .prepare(
      `SELECT
        file_path,
        GROUP_CONCAT(terminal_id, ',') AS terminal_ids,
        COUNT(DISTINCT terminal_id) AS lock_count
      FROM file_locks
      WHERE workspace_id = ?
      GROUP BY file_path
      HAVING COUNT(DISTINCT terminal_id) > 1`,
    )
    .all(workspaceId) as ConflictingFileRow[];
};

export const insertFileChange = (
  db: BetterSqlite3.Database,
  filePath: string,
  terminalId: string,
  workspaceId: string,
  timestamp: number,
  changeType: 'create' | 'modify' | 'delete',
): void => {
  db.prepare(
    `INSERT INTO file_changes (file_path, terminal_id, workspace_id, timestamp, change_type)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(filePath, terminalId, workspaceId, timestamp, changeType);
};

export const listRecentFileChanges = (
  db: BetterSqlite3.Database,
  since: number,
  limit: number,
  filePath?: string,
): FileChangeRow[] => {
  if (filePath) {
    return db
      .prepare(
        `SELECT file_path, terminal_id, workspace_id, timestamp, change_type
         FROM file_changes
         WHERE timestamp >= ? AND file_path = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(since, filePath, limit) as FileChangeRow[];
  }

  return db
    .prepare(
      `SELECT file_path, terminal_id, workspace_id, timestamp, change_type
       FROM file_changes
       WHERE timestamp >= ?
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(since, limit) as FileChangeRow[];
};

export const insertNotification = (
  db: BetterSqlite3.Database,
  notification: NotificationRow,
): void => {
  db.prepare(
    `INSERT INTO notifications (
      id, title, body, level, terminal_id, workspace_id, timestamp, is_read
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    notification.id,
    notification.title,
    notification.body,
    notification.level,
    notification.terminal_id,
    notification.workspace_id,
    notification.timestamp,
    notification.is_read,
  );
};

export const markNotificationRead = (db: BetterSqlite3.Database, id: string): void => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
};

export const listUnreadNotifications = (
  db: BetterSqlite3.Database,
  limit: number,
): NotificationRow[] => {
  return db
    .prepare(
      `SELECT * FROM notifications
       WHERE is_read = 0
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(limit) as NotificationRow[];
};

export const listPreferences = (db: BetterSqlite3.Database): PreferenceRow[] => {
  return db.prepare('SELECT * FROM preferences ORDER BY key ASC').all() as PreferenceRow[];
};

export const upsertPreference = (
  db: BetterSqlite3.Database,
  key: string,
  value: string,
  updatedAt: number,
): void => {
  db.prepare(
    `INSERT INTO preferences (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, updatedAt);
};

export const listKeybindings = (db: BetterSqlite3.Database): KeybindingRow[] => {
  return db.prepare('SELECT * FROM keybindings ORDER BY action ASC').all() as KeybindingRow[];
};

export const upsertKeybinding = (
  db: BetterSqlite3.Database,
  action: string,
  shortcut: string,
  updatedAt: number,
): void => {
  db.prepare(
    `INSERT INTO keybindings (action, shortcut, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(action) DO UPDATE SET
       shortcut = excluded.shortcut,
       updated_at = excluded.updated_at`,
  ).run(action, shortcut, updatedAt);
};

export const deleteKeybinding = (db: BetterSqlite3.Database, action: string): void => {
  db.prepare('DELETE FROM keybindings WHERE action = ?').run(action);
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
