import type {
  CloseTerminalRequest,
  CreateTerminalRequest,
  CreateTerminalResponse,
  ListTerminalsResponse,
  ResizeTerminalRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalProtectionEvent,
  TerminalStatusEvent,
  WriteTerminalRequest,
} from './terminal';
import type {
  CreateWorkspaceRequest,
  ListWorkspacesResponse,
  UpdateWorkspaceRequest,
  Workspace,
} from './workspace';
import type { TerminalEvent } from './event';
import type { ListSessionsRequest, ListSessionsResponse } from './session';
import type { ContextQuery, ContextResult, FileChangeEvent, FileConflict } from './broker';
import type { AssistantMessage, AssistantStreamChunk, PromptDraft, RichSuggestion } from './assistant';
import type { AppNotification } from './notification';

export interface TmasterApi {
  createTerminal: (request: CreateTerminalRequest) => Promise<CreateTerminalResponse>;
  writeTerminal: (request: WriteTerminalRequest) => Promise<void>;
  resizeTerminal: (request: ResizeTerminalRequest) => Promise<void>;
  closeTerminal: (request: CloseTerminalRequest) => Promise<void>;
  listTerminals: () => Promise<ListTerminalsResponse>;
  onTerminalData: (handler: (event: TerminalDataEvent) => void) => () => void;
  onTerminalExit: (handler: (event: TerminalExitEvent) => void) => () => void;
  onTerminalStatus: (handler: (event: TerminalStatusEvent) => void) => () => void;
  onTerminalProtection: (handler: (event: TerminalProtectionEvent) => void) => () => void;
  onTerminalEvent: (handler: (event: TerminalEvent) => void) => () => void;
  createWorkspace: (request: CreateWorkspaceRequest) => Promise<Workspace>;
  listWorkspaces: () => Promise<ListWorkspacesResponse>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  updateWorkspace: (request: UpdateWorkspaceRequest) => Promise<Workspace>;
  listSessions: (request: ListSessionsRequest) => Promise<ListSessionsResponse>;
  getContext: (query: ContextQuery) => Promise<ContextResult>;
  onConflict: (handler: (conflict: FileConflict) => void) => () => void;
  onFileChange: (handler: (event: FileChangeEvent) => void) => () => void;
  sendAssistantMessage: (content: string) => Promise<void>;
  generatePrompt: (intent: string) => Promise<PromptDraft>;
  executePrompt: (draft: PromptDraft) => Promise<{ terminalId: string }>;
  onAssistantMessage: (handler: (message: AssistantMessage) => void) => () => void;
  onAssistantStreamChunk: (handler: (chunk: AssistantStreamChunk) => void) => () => void;
  onSuggestion: (handler: (suggestion: RichSuggestion) => void) => () => void;
  onNotification: (handler: (notification: AppNotification) => void) => () => void;
  dismissNotification: (id: string) => Promise<void>;
}
