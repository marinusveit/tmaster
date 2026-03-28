import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type {
  CloseTerminalRequest,
  CreateTerminalRequest,
  ReorderTerminalsRequest,
  ResizeTerminalRequest,
  WriteTerminalRequest,
} from '../../shared/types/terminal';
import type { TerminalManager } from '../terminal/TerminalManager';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const asString = (value: unknown): string | null => {
  return typeof value === 'string' ? value : null;
};

export const registerTerminalHandlers = (ipcMain: IpcMain, terminalManager: TerminalManager): void => {
  ipcMain.handle(IPC_CHANNELS.terminalCreate, (_event, payload: unknown) => {
    const request = parseCreateRequest(payload);
    return terminalManager.createTerminal(request);
  });

  ipcMain.handle(IPC_CHANNELS.terminalWrite, (_event, payload: unknown) => {
    const request = parseWriteRequest(payload);
    terminalManager.writeTerminal(request.terminalId, request.data);
  });

  ipcMain.handle(IPC_CHANNELS.terminalResize, (_event, payload: unknown) => {
    const request = parseResizeRequest(payload);
    terminalManager.resizeTerminal(request.terminalId, request.cols, request.rows);
  });

  ipcMain.handle(IPC_CHANNELS.terminalClose, (_event, payload: unknown) => {
    const request = parseCloseRequest(payload);
    terminalManager.closeTerminal(request.terminalId);
  });

  ipcMain.handle(IPC_CHANNELS.terminalReorder, (_event, payload: unknown) => {
    const request = parseReorderRequest(payload);
    terminalManager.reorderTerminals(request);
  });

  ipcMain.handle(IPC_CHANNELS.terminalList, () => {
    return { terminals: terminalManager.listTerminals() };
  });
};

const parseCreateRequest = (payload: unknown): CreateTerminalRequest => {
  if (!isObject(payload)) {
    return {};
  }

  const cwd = asString(payload.cwd);
  const shell = asString(payload.shell);
  const workspaceId = asString(payload.workspaceId);
  const label = asString(payload.label);
  return {
    cwd: cwd ?? undefined,
    shell: shell ?? undefined,
    workspaceId: workspaceId ?? undefined,
    label: label ?? undefined,
  };
};

const parseWriteRequest = (payload: unknown): WriteTerminalRequest => {
  if (!isObject(payload)) {
    throw new Error('Invalid write payload');
  }

  const terminalId = asString(payload.terminalId);
  const data = asString(payload.data);
  if (!terminalId || data === null) {
    throw new Error('Invalid write payload');
  }

  return { terminalId, data };
};

const parseResizeRequest = (payload: unknown): ResizeTerminalRequest => {
  if (!isObject(payload)) {
    throw new Error('Invalid resize payload');
  }

  const terminalId = asString(payload.terminalId);
  const cols = payload.cols;
  const rows = payload.rows;

  if (
    !terminalId ||
    typeof cols !== 'number' ||
    typeof rows !== 'number' ||
    !Number.isFinite(cols) ||
    !Number.isFinite(rows) ||
    cols < 1 ||
    rows < 1
  ) {
    throw new Error('Invalid resize payload');
  }

  return { terminalId, cols, rows };
};

const parseCloseRequest = (payload: unknown): CloseTerminalRequest => {
  if (!isObject(payload)) {
    throw new Error('Invalid close payload');
  }

  const terminalId = asString(payload.terminalId);
  if (!terminalId) {
    throw new Error('Invalid close payload');
  }

  return { terminalId };
};

const parseReorderRequest = (payload: unknown): ReorderTerminalsRequest => {
  if (!isObject(payload)) {
    throw new Error('Invalid reorder payload');
  }

  const workspaceId = asString(payload.workspaceId);
  const orderedTerminalIdsValue = payload.orderedTerminalIds;
  if (!workspaceId || !Array.isArray(orderedTerminalIdsValue)) {
    throw new Error('Invalid reorder payload');
  }

  const orderedTerminalIds = orderedTerminalIdsValue.map((terminalId) => asString(terminalId));
  if (
    orderedTerminalIds.length === 0
    || orderedTerminalIds.some((terminalId) => !terminalId)
    || new Set(orderedTerminalIds).size !== orderedTerminalIds.length
  ) {
    throw new Error('Invalid reorder payload');
  }

  return {
    workspaceId,
    orderedTerminalIds: orderedTerminalIds as string[],
  };
};
