import path from 'node:path';
import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import { app } from 'electron';
import { resolveDatabasePath } from '../../shared/constants/paths';

let database: BetterSqlite3.Database | null = null;

/**
 * Erstellt oder gibt die bestehende DB-Instanz zurück.
 * Mit optionalem Pfad für Tests (z.B. ':memory:').
 */
export const getDatabase = (dbPath?: string): BetterSqlite3.Database => {
  if (database) {
    return database;
  }

  const resolvedPath = resolveDatabasePath({
    dbPath,
    userDataPath: app.getPath('userData'),
    pathSeparator: path.sep,
  });
  database = new Database(resolvedPath);

  // WAL-Modus für bessere Concurrent-Read-Performance
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = NORMAL');
  database.pragma('foreign_keys = ON');

  return database;
};

/**
 * Schließt die DB-Verbindung sauber.
 */
export const closeDatabase = (): void => {
  if (database) {
    database.close();
    database = null;
  }
};

/**
 * Factory für Tests — erstellt eine isolierte In-Memory-DB.
 */
export const createTestDatabase = (): BetterSqlite3.Database => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  return db;
};
