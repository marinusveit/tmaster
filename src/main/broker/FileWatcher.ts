import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import type { FileChangeEvent, FileConflict } from '../../shared/types/broker';
import {
  getConflictingFiles,
  removeAllFileLocksForTerminal,
  upsertFileLock,
} from '../db/queries';

export type ChangeType = 'create' | 'modify' | 'delete';

interface WorkspaceWatcher {
  close: () => void;
}

type WatcherFactory = (
  workspacePath: string,
  onFileEvent: (changeType: ChangeType, filePath: string) => void,
) => WorkspaceWatcher;

interface WorkspaceState {
  workspaceId: string;
  workspacePath: string;
  watcher: WorkspaceWatcher;
}

const IGNORED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
]);

const isIgnoredPath = (filePath: string): boolean => {
  if (filePath.endsWith('.lock')) {
    return true;
  }

  const segments = filePath.split(path.sep);
  return segments.some((segment) => IGNORED_SEGMENTS.has(segment));
};

const createDefaultWatcher: WatcherFactory = (workspacePath, onFileEvent) => {
  const handleFsChange = (eventType: string, filename: string | Buffer | null): void => {
    if (typeof filename !== 'string' || filename.length === 0) {
      return;
    }

    const normalizedRelativePath = path.normalize(filename);
    if (isIgnoredPath(normalizedRelativePath)) {
      return;
    }

    const fullPath = path.join(workspacePath, normalizedRelativePath);
    const changeType: ChangeType = eventType === 'rename' ? 'create' : 'modify';
    onFileEvent(changeType, fullPath);
  };

  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(workspacePath, { recursive: true }, handleFsChange);
  } catch {
    // Linux unterstützt recursive nicht überall; fallback auf Top-Level-Watch.
    watcher = fs.watch(workspacePath, { recursive: false }, handleFsChange);
  }

  return {
    close: () => {
      watcher.close();
    },
  };
};

export class FileWatcher {
  private readonly watchers = new Map<string, WorkspaceState>();

  public constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly onConflict: (conflict: FileConflict) => void,
    private readonly onFileChange: (event: FileChangeEvent) => void,
    private readonly createWatcher: WatcherFactory = createDefaultWatcher,
  ) {}

  public watch(workspaceId: string, workspacePath: string): void {
    if (this.watchers.has(workspaceId)) {
      return;
    }

    // Tilde expandieren — fs.watch versteht kein '~'
    const resolvedPath = workspacePath.startsWith('~')
      ? path.join(os.homedir(), workspacePath.slice(1))
      : workspacePath;

    if (!fs.existsSync(resolvedPath)) {
      return;
    }

    const watcher = this.createWatcher(resolvedPath, (changeType, changedFilePath) => {
      const filePath = path.normalize(changedFilePath);
      const terminalId = `watcher:${workspaceId}`;
      const timestamp = Date.now();

      upsertFileLock(this.db, filePath, terminalId, workspaceId, timestamp);

      const changeEvent: FileChangeEvent = {
        filePath,
        terminalId,
        timestamp,
        changeType,
      };
      this.onFileChange(changeEvent);

      const conflict = this.checkConflicts(filePath, workspaceId);
      if (conflict) {
        this.onConflict(conflict);
      }
    });

    this.watchers.set(workspaceId, {
      workspaceId,
      workspacePath: resolvedPath,
      watcher,
    });
  }

  public unwatch(workspaceId: string): void {
    const entry = this.watchers.get(workspaceId);
    if (!entry) {
      return;
    }

    entry.watcher.close();
    this.watchers.delete(workspaceId);
  }

  public unwatchAll(): void {
    for (const workspaceId of this.watchers.keys()) {
      this.unwatch(workspaceId);
    }
  }

  public registerFileAccess(filePath: string, terminalId: string, workspaceId: string): void {
    const normalizedFilePath = path.normalize(filePath);
    const timestamp = Date.now();

    upsertFileLock(this.db, normalizedFilePath, terminalId, workspaceId, timestamp);

    this.onFileChange({
      filePath: normalizedFilePath,
      terminalId,
      timestamp,
      changeType: 'modify',
    });

    const conflict = this.checkConflicts(normalizedFilePath, workspaceId);
    if (conflict) {
      this.onConflict(conflict);
    }
  }

  public checkConflicts(filePath: string, workspaceId: string): FileConflict | null {
    const normalizedFilePath = path.normalize(filePath);
    const conflictRows = getConflictingFiles(this.db, workspaceId);
    const row = conflictRows.find((item) => path.normalize(item.file_path) === normalizedFilePath);

    if (!row) {
      return null;
    }

    const terminalIds = row.terminal_ids
      .split(',')
      .map((terminalId) => terminalId.trim())
      .filter((terminalId) => terminalId.length > 0);

    return {
      filePath: normalizedFilePath,
      terminalIds,
      detectedAt: Date.now(),
    };
  }

  public releaseTerminalLocks(terminalId: string): void {
    removeAllFileLocksForTerminal(this.db, terminalId);
  }

  public getWatchedWorkspaceCount(): number {
    return this.watchers.size;
  }

  public isIgnored(filePath: string): boolean {
    return isIgnoredPath(path.normalize(filePath));
  }
}
