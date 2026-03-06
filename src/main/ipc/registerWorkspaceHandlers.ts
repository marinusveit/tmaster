import { randomUUID } from 'node:crypto';
import type { IpcMain } from 'electron';
import type BetterSqlite3 from 'better-sqlite3';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { Workspace } from '../../shared/types/workspace';
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
} from '../db/queries';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const asString = (value: unknown): string | null => {
  return typeof value === 'string' ? value : null;
};

const toWorkspace = (row: {
  id: string;
  name: string;
  path: string;
  next_terminal_index: number;
  created_at: number;
}): Workspace => ({
  id: row.id,
  name: row.name,
  path: row.path,
  nextTerminalIndex: row.next_terminal_index,
  createdAt: row.created_at,
});

export const registerWorkspaceHandlers = (
  ipcMain: IpcMain,
  db: BetterSqlite3.Database,
  onWorkspaceSwitch?: (workspaceId: string, senderId: number) => void,
): void => {
  ipcMain.handle(IPC_CHANNELS.workspaceCreate, (_event, payload: unknown) => {
    if (!isObject(payload)) {
      throw new Error('Invalid workspace create payload');
    }

    const name = asString(payload.name);
    const path = asString(payload.path);

    if (!name || !path) {
      throw new Error('Workspace name and path are required');
    }

    const id = randomUUID();
    const row = createWorkspace(db, id, name, path, Date.now());
    return toWorkspace(row);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceList, () => {
    const rows = listWorkspaces(db);
    return { workspaces: rows.map(toWorkspace) };
  });

  ipcMain.handle(IPC_CHANNELS.workspaceSwitch, (event, payload: unknown) => {
    const workspaceId = typeof payload === 'string' ? payload : null;
    if (!workspaceId) {
      throw new Error('Invalid workspace ID');
    }

    const row = getWorkspace(db, workspaceId);
    if (!row) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    onWorkspaceSwitch?.(workspaceId, event.sender.id);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceUpdate, (_event, payload: unknown) => {
    if (!isObject(payload)) {
      throw new Error('Invalid workspace update payload');
    }

    const id = asString(payload.id);
    if (!id) {
      throw new Error('Workspace ID is required');
    }

    const row = getWorkspace(db, id);
    if (!row) {
      throw new Error(`Workspace ${id} not found`);
    }

    const name = asString(payload.name);
    const path = asString(payload.path);

    updateWorkspace(db, id, {
      name: name ?? undefined,
      path: path ?? undefined,
    });

    const updated = getWorkspace(db, id);
    if (!updated) {
      throw new Error(`Workspace ${id} disappeared after update`);
    }

    return toWorkspace(updated);
  });
};
