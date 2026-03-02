import { create } from 'zustand';
import { transport } from '@renderer/transport';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';
import type {
  AssistantMessage,
  CoachingLevel,
  RichSuggestion,
  Suggestion,
  SuggestionAction,
  SuggestionPriority,
} from '@shared/types/assistant';

interface AssistantStoreState {
  isExpanded: boolean;
  messages: AssistantMessage[];
  suggestions: Suggestion[];
  richSuggestions: RichSuggestion[];
  coachingLevel: CoachingLevel;
  isTyping: boolean;
}

interface AssistantStoreActions {
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  addMessage: (message: AssistantMessage) => void;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
  setSuggestions: (suggestions: Suggestion[]) => void;
  removeSuggestion: (id: string) => void;
  setCoachingLevel: (level: CoachingLevel) => void;
  addRichSuggestion: (suggestion: RichSuggestion) => void;
  removeRichSuggestion: (id: string) => void;
  executeSuggestionAction: (suggestionId: string, action: SuggestionAction) => Promise<void>;
}

export type AssistantStore = AssistantStoreState & AssistantStoreActions;

const PRIORITY_ORDER: Record<SuggestionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const sortRichSuggestions = (suggestions: RichSuggestion[]): RichSuggestion[] => {
  return [...suggestions].sort((a, b) => {
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (byPriority !== 0) {
      return byPriority;
    }

    return b.timestamp - a.timestamp;
  });
};

const createUserMessage = (content: string): AssistantMessage => {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content,
    timestamp: Date.now(),
  };
};

const removeRichSuggestionFromState = (
  state: AssistantStoreState,
  id: string,
): Pick<AssistantStoreState, 'richSuggestions'> => {
  return {
    richSuggestions: state.richSuggestions.filter((item) => item.id !== id),
  };
};

export const useAssistantStore = create<AssistantStore>((set) => ({
  isExpanded: false,
  messages: [],
  suggestions: [],
  richSuggestions: [],
  coachingLevel: 'suggest',
  isTyping: false,

  toggleExpanded: () => {
    set((state) => ({ isExpanded: !state.isExpanded }));
  },

  setExpanded: (expanded) => {
    set({ isExpanded: expanded });
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
      isTyping: message.role === 'assistant' ? false : state.isTyping,
    }));
  },

  sendMessage: (content) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const userMessage = createUserMessage(trimmed);

    set((state) => ({
      messages: [...state.messages, userMessage],
      isTyping: true,
    }));

    void transport.invoke<void>('sendAssistantMessage', trimmed).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Senden';
      const assistantErrorMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Fehler: ${message}`,
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, assistantErrorMessage],
        isTyping: false,
      }));
    });
  },

  clearMessages: () => {
    set({ messages: [], isTyping: false });
  },

  setSuggestions: (suggestions) => {
    set({ suggestions });
  },

  removeSuggestion: (id) => {
    set((state) => ({
      suggestions: state.suggestions.filter((item) => item.id !== id),
    }));
  },

  setCoachingLevel: (level) => {
    set({ coachingLevel: level });
  },

  addRichSuggestion: (suggestion) => {
    set((state) => {
      const withoutOld = state.richSuggestions.filter((item) => item.id !== suggestion.id);
      return {
        richSuggestions: sortRichSuggestions([...withoutOld, suggestion]),
      };
    });
  },

  removeRichSuggestion: (id) => {
    set((state) => removeRichSuggestionFromState(state, id));
  },

  executeSuggestionAction: async (suggestionId, action) => {
    const payload = action.payload;

    if (action.type === 'focus-terminal') {
      if (payload) {
        useTerminalStore.getState().setActiveTerminal(payload);
      }
      return;
    }

    if (action.type === 'close-terminal') {
      if (!payload) {
        return;
      }

      await transport.invoke<void>('closeTerminal', { terminalId: payload });
      useTerminalStore.getState().removeTerminal(payload);
      return;
    }

    if (action.type === 'new-terminal') {
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      await transport.invoke('createTerminal', {
        workspaceId: activeWorkspaceId ?? undefined,
      });
      return;
    }

    if (action.type === 'send-prompt') {
      if (!payload) {
        return;
      }

      await transport.invoke<void>('writeTerminal', {
        terminalId: payload,
        data: 'Bitte analysiere den letzten Fehler und schlage einen Fix vor.\n',
      });
      return;
    }

    set((state) => removeRichSuggestionFromState(state, suggestionId));
  },
}));
