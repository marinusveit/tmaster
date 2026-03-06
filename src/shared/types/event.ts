export type EventType =
  | 'error'
  | 'warning'
  | 'test_result'
  | 'server_started'
  | 'context_warning'
  | 'waiting';

export type EventSource = 'pattern' | 'exit_code' | 'hook' | 'llm_triage';

export interface TerminalEvent {
  terminalId: string;
  timestamp: number;
  type: EventType;
  summary: string;
  details?: string;
  source: EventSource;
}
