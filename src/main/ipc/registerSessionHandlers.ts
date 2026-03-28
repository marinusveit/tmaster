import type { IpcMain } from 'electron';
import type BetterSqlite3 from 'better-sqlite3';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { SessionInfo } from '../../shared/types/session';
import { listSessions } from '../db/queries';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const toSessionInfo = (row: {
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
}): SessionInfo => ({
  id: row.id,
  terminalId: row.terminal_id,
  workspaceId: row.workspace_id,
  labelPrefix: row.label_prefix,
  labelIndex: row.label_index,
  displayOrder: row.display_order,
  status: row.status,
  createdAt: row.created_at,
  endedAt: row.ended_at,
  shell: row.shell,
});

export const registerSessionHandlers = (
  ipcMain: IpcMain,
  db: BetterSqlite3.Database,
): void => {
  ipcMain.handle(IPC_CHANNELS.sessionList, (_event, payload: unknown) => {
    let workspaceId: string | undefined;

    if (isObject(payload)) {
      const id = payload.workspaceId;
      if (typeof id === 'string') {
        workspaceId = id;
      }
    }

    const rows = listSessions(db, workspaceId);
    return { sessions: rows.map(toSessionInfo) };
  });
};
