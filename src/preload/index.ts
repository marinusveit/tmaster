import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { TmasterApi } from '../shared/types/preload';
import type {
  CloseTerminalRequest,
  CreateTerminalRequest,
  CreateTerminalResponse,
  ListTerminalsResponse,
  ResizeTerminalRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalStatusEvent,
  WriteTerminalRequest,
} from '../shared/types/terminal';
import type {
  CreateWorkspaceRequest,
  ListWorkspacesResponse,
  UpdateWorkspaceRequest,
  Workspace,
} from '../shared/types/workspace';
import type { TerminalEvent } from '../shared/types/event';
import type { ListSessionsRequest, ListSessionsResponse } from '../shared/types/session';

const api: TmasterApi = {
  createTerminal: (request: CreateTerminalRequest): Promise<CreateTerminalResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.terminalCreate, request);
  },
  writeTerminal: (request: WriteTerminalRequest): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.terminalWrite, request);
  },
  resizeTerminal: (request: ResizeTerminalRequest): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.terminalResize, request);
  },
  closeTerminal: (request: CloseTerminalRequest): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.terminalClose, request);
  },
  listTerminals: (): Promise<ListTerminalsResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.terminalList);
  },
  onTerminalData: (handler: (event: TerminalDataEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.terminalData, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalData, listener);
  },
  onTerminalExit: (handler: (event: TerminalExitEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.terminalExit, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalExit, listener);
  },
  onTerminalStatus: (handler: (event: TerminalStatusEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalStatusEvent) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.terminalStatus, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalStatus, listener);
  },
  onTerminalEvent: (handler: (event: TerminalEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalEvent) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.terminalEvent, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalEvent, listener);
  },
  createWorkspace: (request: CreateWorkspaceRequest): Promise<Workspace> => {
    return ipcRenderer.invoke(IPC_CHANNELS.workspaceCreate, request);
  },
  listWorkspaces: (): Promise<ListWorkspacesResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.workspaceList);
  },
  switchWorkspace: (workspaceId: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.workspaceSwitch, workspaceId);
  },
  updateWorkspace: (request: UpdateWorkspaceRequest): Promise<Workspace> => {
    return ipcRenderer.invoke(IPC_CHANNELS.workspaceUpdate, request);
  },
  listSessions: (request: ListSessionsRequest): Promise<ListSessionsResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.sessionList, request);
  },
};

contextBridge.exposeInMainWorld('tmaster', api);
