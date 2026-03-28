import type { IpcMain } from 'electron';
import type BetterSqlite3 from 'better-sqlite3';
import { MAX_SPLIT_RATIO, MIN_SPLIT_RATIO } from '../../shared/constants/defaults';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { SaveUiStateRequest, SplitMode } from '../../shared/types/uiState';
import { getUiState, getWorkspace, saveUiState } from '../db/queries';

const VALID_SPLIT_MODES: SplitMode[] = ['single', 'horizontal', 'vertical', 'grid'];

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isNullableString = (value: unknown): value is string | null => {
  return value === null || (typeof value === 'string' && value.length > 0);
};

const isSplitMode = (value: unknown): value is SplitMode => {
  return typeof value === 'string' && VALID_SPLIT_MODES.includes(value as SplitMode);
};

const clampSplitRatio = (ratio: number): number => {
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
};

const parseSaveUiStateRequest = (payload: unknown): SaveUiStateRequest => {
  if (!isObject(payload)) {
    throw new Error('Invalid UI state payload');
  }

  const request: SaveUiStateRequest = {};

  if ('activeWorkspaceId' in payload) {
    if (!isNullableString(payload.activeWorkspaceId)) {
      throw new Error('Invalid active workspace ID');
    }
    request.activeWorkspaceId = payload.activeWorkspaceId;
  }

  if ('activeTerminalId' in payload) {
    if (!isNullableString(payload.activeTerminalId)) {
      throw new Error('Invalid active terminal ID');
    }
    request.activeTerminalId = payload.activeTerminalId;
  }

  if ('splitMode' in payload) {
    if (!isSplitMode(payload.splitMode)) {
      throw new Error(`Invalid split mode, expected one of: ${VALID_SPLIT_MODES.join(', ')}`);
    }
    request.splitMode = payload.splitMode;
  }

  if ('splitRatio' in payload) {
    if (typeof payload.splitRatio !== 'number' || !Number.isFinite(payload.splitRatio)) {
      throw new Error('Invalid split ratio');
    }
    request.splitRatio = clampSplitRatio(payload.splitRatio);
  }

  return request;
};

export const registerUiStateHandlers = (
  ipcMain: IpcMain,
  db: BetterSqlite3.Database,
): void => {
  ipcMain.handle(IPC_CHANNELS.uiStateGet, () => {
    return getUiState(db);
  });

  ipcMain.handle(IPC_CHANNELS.uiStateSave, (_event, payload: unknown) => {
    const request = parseSaveUiStateRequest(payload);

    if (request.activeWorkspaceId) {
      const workspace = getWorkspace(db, request.activeWorkspaceId);
      if (!workspace) {
        throw new Error(`Workspace ${request.activeWorkspaceId} not found`);
      }
    }

    return saveUiState(db, request);
  });
};
