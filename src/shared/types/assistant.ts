export type CoachingLevel = 'observe' | 'suggest' | 'coach' | 'act';

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
