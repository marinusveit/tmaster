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
} from './terminal';
import type {
  CreateWorkspaceRequest,
  ListWorkspacesResponse,
  UpdateWorkspaceRequest,
  Workspace,
} from './workspace';
import type { TerminalEvent } from './event';
import type { ListSessionsRequest, ListSessionsResponse } from './session';

export interface TmasterApi {
  createTerminal: (request: CreateTerminalRequest) => Promise<CreateTerminalResponse>;
  writeTerminal: (request: WriteTerminalRequest) => Promise<void>;
  resizeTerminal: (request: ResizeTerminalRequest) => Promise<void>;
  closeTerminal: (request: CloseTerminalRequest) => Promise<void>;
  listTerminals: () => Promise<ListTerminalsResponse>;
  onTerminalData: (handler: (event: TerminalDataEvent) => void) => () => void;
  onTerminalExit: (handler: (event: TerminalExitEvent) => void) => () => void;
  onTerminalStatus: (handler: (event: TerminalStatusEvent) => void) => () => void;
  onTerminalEvent: (handler: (event: TerminalEvent) => void) => () => void;
  createWorkspace: (request: CreateWorkspaceRequest) => Promise<Workspace>;
  listWorkspaces: () => Promise<ListWorkspacesResponse>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  updateWorkspace: (request: UpdateWorkspaceRequest) => Promise<Workspace>;
  listSessions: (request: ListSessionsRequest) => Promise<ListSessionsResponse>;
}
