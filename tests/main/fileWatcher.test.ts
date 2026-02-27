import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { FileWatcher, type ChangeType } from '@main/broker/FileWatcher';
import { getFileLocksForWorkspace } from '@main/db/queries';

const createTestDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

interface TestWatcherHandle {
  close: ReturnType<typeof vi.fn>;
  emit: (changeType: ChangeType, filePath: string) => void;
}

describe('FileWatcher', () => {
  let db: InstanceType<typeof Database>;
  let handles: TestWatcherHandle[];

  beforeEach(() => {
    db = createTestDb();
    handles = [];
  });

  afterEach(() => {
    db.close();
  });

  const createWatcherFactory = () => {
    return (_workspacePath: string, onFileEvent: (changeType: ChangeType, filePath: string) => void) => {
      const handle: TestWatcherHandle = {
        close: vi.fn(),
        emit: (changeType, filePath) => {
          onFileEvent(changeType, filePath);
        },
      };

      handles.push(handle);
      return handle;
    };
  };

  it('watch und unwatch verwalten Lifecycle', () => {
    const fileWatcher = new FileWatcher(db, vi.fn(), vi.fn(), createWatcherFactory());

    fileWatcher.watch('ws1', '/tmp/ws1');
    expect(fileWatcher.getWatchedWorkspaceCount()).toBe(1);

    fileWatcher.unwatch('ws1');
    expect(fileWatcher.getWatchedWorkspaceCount()).toBe(0);
    expect(handles[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('registerFileAccess speichert Locks in DB', () => {
    const fileWatcher = new FileWatcher(db, vi.fn(), vi.fn(), createWatcherFactory());

    fileWatcher.registerFileAccess('src/a.ts', 't1', 'ws1');

    const locks = getFileLocksForWorkspace(db, 'ws1');
    expect(locks).toHaveLength(1);
    expect(locks[0]?.file_path).toContain('src');
    expect(locks[0]?.terminal_id).toBe('t1');
  });

  it('checkConflicts erkennt Konflikte bei gleicher Datei', () => {
    const fileWatcher = new FileWatcher(db, vi.fn(), vi.fn(), createWatcherFactory());

    fileWatcher.registerFileAccess('src/a.ts', 't1', 'ws1');
    fileWatcher.registerFileAccess('src/a.ts', 't2', 'ws1');

    const conflict = fileWatcher.checkConflicts('src/a.ts', 'ws1');
    expect(conflict).not.toBeNull();
    expect(conflict?.terminalIds).toContain('t1');
    expect(conflict?.terminalIds).toContain('t2');
  });

  it('releaseTerminalLocks entfernt alle Locks des Terminals', () => {
    const fileWatcher = new FileWatcher(db, vi.fn(), vi.fn(), createWatcherFactory());

    fileWatcher.registerFileAccess('src/a.ts', 't1', 'ws1');
    fileWatcher.registerFileAccess('src/b.ts', 't1', 'ws1');
    fileWatcher.registerFileAccess('src/c.ts', 't2', 'ws1');

    fileWatcher.releaseTerminalLocks('t1');

    const locks = getFileLocksForWorkspace(db, 'ws1');
    expect(locks).toHaveLength(1);
    expect(locks[0]?.terminal_id).toBe('t2');
  });

  it('unwatchAll räumt alle Watcher auf', () => {
    const fileWatcher = new FileWatcher(db, vi.fn(), vi.fn(), createWatcherFactory());

    fileWatcher.watch('ws1', '/tmp/ws1');
    fileWatcher.watch('ws2', '/tmp/ws2');
    fileWatcher.unwatchAll();

    expect(fileWatcher.getWatchedWorkspaceCount()).toBe(0);
    expect(handles[0]?.close).toHaveBeenCalledTimes(1);
    expect(handles[1]?.close).toHaveBeenCalledTimes(1);
  });

  it('sendet FileChange und Konflikt-Broadcasts bei Watch-Events', () => {
    const onConflict = vi.fn();
    const onFileChange = vi.fn();
    const fileWatcher = new FileWatcher(db, onConflict, onFileChange, createWatcherFactory());

    // Pfad muss normalisiert uebereinstimmen: registerFileAccess und emit benutzen denselben Pfad
    fileWatcher.registerFileAccess('/tmp/ws1/src/a.ts', 't1', 'ws1');
    fileWatcher.watch('ws1', '/tmp/ws1');

    // Watcher-Callback normalisiert changedFilePath und speichert als watcher:ws1
    handles[0]?.emit('modify', '/tmp/ws1/src/a.ts');

    expect(onFileChange).toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalled();
  });

  it('ignoriert bekannte Build-Pfade', () => {
    const fileWatcher = new FileWatcher(db, vi.fn(), vi.fn(), createWatcherFactory());

    expect(fileWatcher.isIgnored('node_modules/pkg/index.js')).toBe(true);
    expect(fileWatcher.isIgnored('.git/config')).toBe(true);
    expect(fileWatcher.isIgnored('src/app.ts')).toBe(false);
  });
});
