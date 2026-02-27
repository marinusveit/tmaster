import type { WorkspaceId } from './workspace';

export type TerminalId = string;

export type TerminalStatus = 'active' | 'idle' | 'exited';

export interface TerminalLabel {
  prefix: string;
  index: number;
}

export interface CreateTerminalRequest {
  cwd?: string;
  shell?: string;
  workspaceId?: WorkspaceId;
  label?: string;
}

export interface CreateTerminalResponse {
  terminalId: TerminalId;
  label: TerminalLabel;
  workspaceId: WorkspaceId;
}

export interface WriteTerminalRequest {
  terminalId: TerminalId;
  data: string;
}

export interface ResizeTerminalRequest {
  terminalId: TerminalId;
  cols: number;
  rows: number;
}

export interface CloseTerminalRequest {
  terminalId: TerminalId;
}

export interface TerminalDataEvent {
  terminalId: TerminalId;
  data: string;
}

export interface TerminalExitEvent {
  terminalId: TerminalId;
  exitCode: number | null;
  signal?: number;
}

export interface TerminalSessionInfo {
  terminalId: TerminalId;
  label: TerminalLabel;
  workspaceId: WorkspaceId;
  status: TerminalStatus;
  createdAt: number;
}

export interface TerminalStatusEvent {
  terminalId: TerminalId;
  status: TerminalStatus;
}

export interface ListTerminalsResponse {
  terminals: TerminalSessionInfo[];
}
