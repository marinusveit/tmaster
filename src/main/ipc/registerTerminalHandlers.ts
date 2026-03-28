import { writeFile } from 'node:fs/promises';
import { BrowserWindow, clipboard, dialog, type IpcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type {
  CloseTerminalRequest,
  CreateTerminalRequest,
  ReorderTerminalsRequest,
  ResizeTerminalRequest,
  TerminalExportRequest,
  SendTerminalInputRequest,
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

  ipcMain.handle(IPC_CHANNELS.terminalSendInput, (_event, payload: unknown) => {
    const request = parseSendInputRequest(payload);
    terminalManager.sendInput(request.terminalId, request.input);
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

  ipcMain.handle(IPC_CHANNELS.terminalCopyBuffer, (_event, payload: unknown) => {
    const request = parseExportRequest(payload);
    clipboard.writeText(request.content);
  });

  ipcMain.handle(IPC_CHANNELS.terminalSaveBuffer, async (event, payload: unknown) => {
    const request = parseExportRequest(payload);
    return saveTerminalBuffer(event, terminalManager, request);
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

const parseSendInputRequest = (payload: unknown): SendTerminalInputRequest => {
  if (!isObject(payload)) {
    throw new Error('Invalid sendInput payload');
  }

  const terminalId = asString(payload.terminalId);
  const input = asString(payload.input);
  if (!terminalId || input === null) {
    throw new Error('Invalid sendInput payload');
  }

  return { terminalId, input };
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

const parseExportRequest = (payload: unknown): TerminalExportRequest => {
  if (!isObject(payload)) {
    throw new Error('Invalid export payload');
  }

  const terminalId = asString(payload.terminalId);
  const content = asString(payload.content);
  const scope = payload.scope;
  if (!terminalId || content === null || (scope !== 'full' && scope !== 'visible')) {
    throw new Error('Invalid export payload');
  }

  return {
    terminalId,
    content,
    scope,
  };
};

const buildExportFilename = (terminalManager: TerminalManager, request: TerminalExportRequest): string => {
  const session = terminalManager.getSession(request.terminalId);
  const terminalLabel = session ? `${session.label.prefix}${session.label.index}` : request.terminalId;
  const scopeSuffix = request.scope === 'visible' ? '-visible' : '';
  return `${terminalLabel}-output${scopeSuffix}.txt`;
};

const saveTerminalBuffer = async (
  event: IpcMainInvokeEvent,
  terminalManager: TerminalManager,
  request: TerminalExportRequest,
): Promise<boolean> => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const dialogOptions = {
    defaultPath: buildExportFilename(terminalManager, request),
    filters: [
      {
        name: 'Text',
        extensions: ['txt'],
      },
    ],
    title: 'Terminal-Output exportieren',
  };

  const result = browserWindow
    ? await dialog.showSaveDialog(browserWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (result.canceled || !result.filePath) {
    return false;
  }

  await writeFile(result.filePath, request.content, 'utf8');
  return true;
};
