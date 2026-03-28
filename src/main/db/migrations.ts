import type BetterSqlite3 from 'better-sqlite3';

/**
 * Erstellt das Phase-2-Schema idempotent (IF NOT EXISTS).
 */
export const runMigrations = (db: BetterSqlite3.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      next_terminal_index INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      terminal_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      label_prefix TEXT NOT NULL DEFAULT 'T',
      label_index INTEGER NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      ended_at INTEGER,
      shell TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_workspace
      ON sessions(workspace_id);

    CREATE INDEX IF NOT EXISTS idx_sessions_status
      ON sessions(status);

    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      timestamp INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_session
      ON session_events(session_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_events_type
      ON session_events(event_type);

    CREATE TABLE IF NOT EXISTS file_locks (
      file_path TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      locked_at INTEGER NOT NULL,
      PRIMARY KEY (file_path, terminal_id)
    );

    CREATE INDEX IF NOT EXISTS idx_file_locks_workspace
      ON file_locks(workspace_id);

    CREATE TABLE IF NOT EXISTS file_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      change_type TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_file_changes_time
      ON file_changes(timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_file_changes_path
      ON file_changes(file_path, timestamp DESC);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      terminal_id TEXT,
      workspace_id TEXT,
      timestamp INTEGER NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_timestamp
      ON notifications(timestamp);

    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_terminal_id
      ON sessions(terminal_id);

    CREATE INDEX IF NOT EXISTS idx_events_workspace_time
      ON session_events(session_id, event_type, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_file_locks_file_terminal
      ON file_locks(file_path, terminal_id);

    CREATE TABLE IF NOT EXISTS window_state (
      window_key TEXT PRIMARY KEY,
      x INTEGER,
      y INTEGER,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      is_maximized INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ui_state (
      state_key TEXT PRIMARY KEY,
      active_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      active_terminal_id TEXT,
      split_mode TEXT NOT NULL DEFAULT 'single',
      split_ratio REAL NOT NULL DEFAULT 0.5,
      updated_at INTEGER NOT NULL
    );
  `);

  const sessionColumns = db
    .prepare("PRAGMA table_info('sessions')")
    .all() as Array<{ name: string }>;
  const hasDisplayOrder = sessionColumns.some((column) => column.name === 'display_order');
  if (!hasDisplayOrder) {
    db.exec('ALTER TABLE sessions ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;');
    db.exec('UPDATE sessions SET display_order = label_index WHERE display_order = 0;');
  }

  // Retention: alte file_changes aufräumen (älter als 24h)
  db.exec(`
    DELETE FROM file_changes WHERE timestamp < ${Date.now() - 24 * 60 * 60 * 1000};
  `);
};
