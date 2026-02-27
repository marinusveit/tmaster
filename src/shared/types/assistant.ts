export type CoachingLevel = 'observe' | 'suggest' | 'coach' | 'act';
export type SuggestionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  action?: string;
  timestamp: number;
}

export interface SuggestionAction {
  type: 'focus-terminal' | 'close-terminal' | 'new-terminal' | 'send-prompt' | 'dismiss';
  label: string;
  payload?: string;
}

export interface RichSuggestion {
  id: string;
  title: string;
  description: string;
  priority: SuggestionPriority;
  terminalId?: string;
  actions: SuggestionAction[];
  timestamp: number;
  category: 'error' | 'idle' | 'context' | 'conflict' | 'workflow';
}
