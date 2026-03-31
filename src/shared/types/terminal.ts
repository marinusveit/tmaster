import type { WorkspaceId } from './workspace';

export type TerminalId = string;

export type TerminalStatus = 'active' | 'idle' | 'exited';
export type TerminalProtectionMode = 'normal' | 'throttled';
export type TerminalProtectionReason = 'none' | 'output-rate' | 'buffer-pressure';

export const DEFAULT_TERMINAL_SCROLLBACK = 5000;
export const TERMINAL_PROTECTION_THRESHOLD_BYTES_PER_SECOND = 1024 * 1024;

export interface TerminalProtectionState {
  mode: TerminalProtectionMode;
  reason: TerminalProtectionReason;
  outputBytesPerSecond: number;
  bufferedBytes: number;
  thresholdBytesPerSecond: number;
  warning: string | null;
  updatedAt: number;
}

export interface TerminalLabel {
  prefix: string;
  index: number;
}

export interface CreateTerminalRequest {
  cwd?: string;
  shell?: string;
  workspaceId?: WorkspaceId;
  label?: string;
  scrollback?: number;
}

export interface CreateTerminalResponse {
  terminalId: TerminalId;
  label: TerminalLabel;
  workspaceId: WorkspaceId;
  displayOrder?: number;
  scrollback: number;
  protection: TerminalProtectionState;
}

export interface WriteTerminalRequest {
  terminalId: TerminalId;
  data: string;
}

export interface SendTerminalInputRequest {
  terminalId: TerminalId;
  input: string;
}

export interface ResizeTerminalRequest {
  terminalId: TerminalId;
  cols: number;
  rows: number;
}

export interface CloseTerminalRequest {
  terminalId: TerminalId;
}

export interface ReorderTerminalsRequest {
  workspaceId: WorkspaceId;
  orderedTerminalIds: TerminalId[];
}

export type TerminalExportScope = 'full' | 'visible';

export interface TerminalExportRequest {
  terminalId: TerminalId;
  content: string;
  scope: TerminalExportScope;
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
  displayOrder?: number;
  status: TerminalStatus;
  createdAt: number;
  scrollback: number;
  protection: TerminalProtectionState;
  isWaiting?: boolean;
  waitingContext?: string;
  waitingSince?: number;
}

export interface TerminalStatusEvent {
  terminalId: TerminalId;
  status: TerminalStatus;
}

export interface TerminalProtectionEvent {
  terminalId: TerminalId;
  protection: TerminalProtectionState;
}

export interface ListTerminalsResponse {
  terminals: TerminalSessionInfo[];
}
