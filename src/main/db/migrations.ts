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
  `);
};
