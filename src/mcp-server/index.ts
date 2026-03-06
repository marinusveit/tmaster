import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import { startMcpServer } from '../main/mcp/McpServer';
import { resolveDatabasePath } from '../shared/constants/paths';

interface CliOptions {
  dbPath?: string;
}

const parseCliOptions = (argv: string[]): CliOptions => {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--db-path') {
      const next = argv[index + 1];
      if (typeof next === 'string' && next.length > 0) {
        options.dbPath = next;
        index += 1;
      }
    }
  }

  return options;
};

const logError = (message: string, error?: unknown): void => {
  if (error === undefined) {
    process.stderr.write(`[tmaster:mcp] ${message}\n`);
    return;
  }

  const details = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[tmaster:mcp] ${message}\n${details}\n`);
};

const enableWalReadCompatibility = (db: BetterSqlite3.Database): void => {
  try {
    db.pragma('journal_mode = WAL');
  } catch (error: unknown) {
    // Read-only Verbindungen können den Modus nicht immer setzen.
    const detail = error instanceof Error ? error.message : String(error);
    logError(`WAL-Modus konnte nicht gesetzt werden: ${detail}`);
  }
};

const main = async (): Promise<void> => {
  const options = parseCliOptions(process.argv.slice(2));
  const dbPath = resolveDatabasePath({
    dbPath: options.dbPath,
    platform: process.platform,
    homeDir: os.homedir(),
    pathSeparator: path.sep,
  });

  if (!fs.existsSync(dbPath)) {
    logError(`Datenbank nicht gefunden: ${dbPath}. Starte zuerst die tmaster App.`);
    process.exit(1);
  }

  const db = new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  });

  db.pragma('foreign_keys = ON');
  enableWalReadCompatibility(db);

  const shutdown = (): void => {
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await startMcpServer(db);
};

void main().catch((error) => {
  logError('Failed to start MCP server', error);
  process.exit(1);
});
