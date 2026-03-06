export type TriageTrigger =
  | 'regex_match'
  | 'silence_timeout'
  | 'output_burst'
  | 'process_exit'
  | 'ambiguous_keyword';

export type TriageStatus =
  | 'action_required'
  | 'error'
  | 'completed'
  | 'working'
  | 'idle';

export type TriageUrgency = 'critical' | 'high' | 'medium' | 'low';

export interface TriageRequest {
  terminalId: string;
  agentType: string;
  recentOutput: string;
  triggerReason: TriageTrigger;
  terminalMeta: {
    status: string;
    runtimeSeconds: number;
    lastEventType?: string;
  };
}

export interface TriageResult {
  status: TriageStatus;
  summary: string;
  detail?: string;
  urgency: TriageUrgency;
  escalate: boolean;
}
