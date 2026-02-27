import { create } from 'zustand';
import type { AssistantMessage, CoachingLevel, Suggestion } from '@shared/types/assistant';

interface AssistantStoreState {
  isExpanded: boolean;
  messages: AssistantMessage[];
  suggestions: Suggestion[];
  coachingLevel: CoachingLevel;
}

interface AssistantStoreActions {
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  addMessage: (message: AssistantMessage) => void;
  clearMessages: () => void;
  setSuggestions: (suggestions: Suggestion[]) => void;
  removeSuggestion: (id: string) => void;
  setCoachingLevel: (level: CoachingLevel) => void;
}

export type AssistantStore = AssistantStoreState & AssistantStoreActions;

export const useAssistantStore = create<AssistantStore>((set) => ({
  isExpanded: false,
  messages: [],
  suggestions: [],
  coachingLevel: 'suggest',

  toggleExpanded: () => {
    set((state) => ({ isExpanded: !state.isExpanded }));
  },

  setExpanded: (expanded) => {
    set({ isExpanded: expanded });
  },

  addMessage: (message) => {
    set((state) => ({ messages: [...state.messages, message] }));
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  setSuggestions: (suggestions) => {
    set({ suggestions });
  },

  removeSuggestion: (id) => {
    set((state) => ({
      suggestions: state.suggestions.filter((s) => s.id !== id),
    }));
  },

  setCoachingLevel: (level) => {
    set({ coachingLevel: level });
  },
}));
