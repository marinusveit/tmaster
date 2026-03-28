import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { TmasterApi } from '../shared/types/preload';
import type {
  CloseTerminalRequest,
  CreateTerminalRequest,
  CreateTerminalResponse,
  ListTerminalsResponse,
  ReorderTerminalsRequest,
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
import type { ContextQuery, ContextResult, FileChangeEvent, FileConflict } from '../shared/types/broker';
import type { AssistantMessage, AssistantStreamChunk, PromptDraft, RichSuggestion } from '../shared/types/assistant';
import type { AppNotification } from '../shared/types/notification';
import type { GetPreferencesResponse, SetPreferenceRequest } from '../shared/types/preferences';

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
  reorderTerminals: (request: ReorderTerminalsRequest): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.terminalReorder, request);
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
  getPreferences: (): Promise<GetPreferencesResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.preferencesGet);
  },
  setPreference: (request: SetPreferenceRequest): Promise<GetPreferencesResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.preferencesSet, request);
  },
  listSessions: (request: ListSessionsRequest): Promise<ListSessionsResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.sessionList, request);
  },
  getContext: (query: ContextQuery): Promise<ContextResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.brokerGetContext, query);
  },
  onConflict: (handler: (conflict: FileConflict) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: FileConflict) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.brokerConflict, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.brokerConflict, listener);
  },
  onFileChange: (handler: (event: FileChangeEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: FileChangeEvent) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.brokerFileChange, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.brokerFileChange, listener);
  },
  sendAssistantMessage: (content: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.assistantSend, content);
  },
  generatePrompt: (intent: string): Promise<PromptDraft> => {
    return ipcRenderer.invoke(IPC_CHANNELS.assistantGeneratePrompt, intent);
  },
  executePrompt: (draft: PromptDraft): Promise<{ terminalId: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.assistantExecutePrompt, draft);
  },
  onAssistantMessage: (handler: (message: AssistantMessage) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AssistantMessage) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.assistantMessage, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.assistantMessage, listener);
  },
  onAssistantStreamChunk: (handler: (chunk: AssistantStreamChunk) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AssistantStreamChunk) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.assistantStreamChunk, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.assistantStreamChunk, listener);
  },
  onSuggestion: (handler: (suggestion: RichSuggestion) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: RichSuggestion) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.assistantSuggestion, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.assistantSuggestion, listener);
  },
  onNotification: (handler: (notification: AppNotification) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AppNotification) => {
      handler(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.notificationShow, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.notificationShow, listener);
  },
  dismissNotification: (id: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.notificationDismiss, id);
  },
};

contextBridge.exposeInMainWorld('tmaster', api);
