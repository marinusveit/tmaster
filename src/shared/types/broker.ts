import type { EventType, TerminalEvent } from './event';

export interface ContextQuery {
  workspaceId?: string;
  terminalId?: string;
  eventTypes?: EventType[];
  since?: number;
  limit?: number;
}

export interface FileConflict {
  filePath: string;
  terminalIds: string[];
  detectedAt: number;
}

export interface ContextResult {
  events: TerminalEvent[];
  activeTerminals: number;
  recentErrors: number;
  conflicts: FileConflict[];
}

export interface FileChangeEvent {
  filePath: string;
  terminalId: string;
  timestamp: number;
  changeType: 'create' | 'modify' | 'delete';
}
