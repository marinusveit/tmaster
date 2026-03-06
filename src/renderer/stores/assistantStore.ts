import { create } from 'zustand';
import type {
  AssistantMessage,
  CoachingLevel,
  PromptAgentType,
  PromptDraft,
  RichSuggestion,
  Suggestion,
  SuggestionAction,
  SuggestionPriority,
} from '@shared/types/assistant';
import type { ListTerminalsResponse } from '@shared/types/terminal';
import { transport } from '@renderer/transport';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';

interface AssistantStoreState {
  isExpanded: boolean;
  messages: AssistantMessage[];
  suggestions: Suggestion[];
  richSuggestions: RichSuggestion[];
  coachingLevel: CoachingLevel;
  isTyping: boolean;
  currentDraft: PromptDraft | null;
  isGeneratingDraft: boolean;
  isExecutingDraft: boolean;
}

interface AssistantStoreActions {
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  addMessage: (message: AssistantMessage) => void;
  sendMessage: (content: string) => void;
  generatePrompt: (intent: string) => Promise<void>;
  updateDraft: (content: string) => void;
  updateDraftAgentType: (agentType: PromptAgentType) => void;
  executeDraft: () => Promise<void>;
  discardDraft: () => void;
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

const createAssistantMessage = (content: string): AssistantMessage => {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
  };
};

const INTENT_KEYWORDS = [
  'soll',
  'mach',
  'fixe',
  'implementiere',
  'baue',
  'starte',
  'fix',
  'implement',
  'build',
  'start',
  'please',
] as const;

export const isIntentMessage = (content: string): boolean => {
  const normalized = content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return INTENT_KEYWORDS.some((keyword) => {
    const pattern = new RegExp(`(^|\\W)${keyword}(\\W|$)`, 'i');
    return pattern.test(normalized);
  });
};

const removeRichSuggestionFromState = (
  state: AssistantStoreState,
  id: string,
): Pick<AssistantStoreState, 'richSuggestions'> => {
  return {
    richSuggestions: state.richSuggestions.filter((item) => item.id !== id),
  };
};

export const useAssistantStore = create<AssistantStore>((set, get) => ({
  isExpanded: false,
  messages: [],
  suggestions: [],
  richSuggestions: [],
  coachingLevel: 'suggest',
  isTyping: false,
  currentDraft: null,
  isGeneratingDraft: false,
  isExecutingDraft: false,

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

    if (isIntentMessage(trimmed)) {
      void get().generatePrompt(trimmed);
      return;
    }

    void transport.invoke<void>('sendAssistantMessage', trimmed).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Senden';
      const assistantErrorMessage = createAssistantMessage(`Fehler: ${message}`);

      set((state) => ({
        messages: [...state.messages, assistantErrorMessage],
        isTyping: false,
      }));
    });
  },

  generatePrompt: async (intent) => {
    const trimmed = intent.trim();
    if (!trimmed) {
      return;
    }

    set({
      isGeneratingDraft: true,
      isTyping: true,
    });

    try {
      const draft = await transport.invoke<PromptDraft>('generatePrompt', trimmed);
      const assistantInfoMessage = createAssistantMessage(
        'Hier ist mein Prompt-Entwurf. Bearbeite ihn oder klicke [Übernehmen].',
      );

      set((state) => ({
        currentDraft: draft,
        isGeneratingDraft: false,
        isTyping: false,
        messages: [...state.messages, assistantInfoMessage],
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Generieren';
      const assistantErrorMessage = createAssistantMessage(`Fehler: ${message}`);

      set((state) => ({
        isGeneratingDraft: false,
        isTyping: false,
        messages: [...state.messages, assistantErrorMessage],
      }));
    }
  },

  updateDraft: (content) => {
    set((state) => {
      if (!state.currentDraft) {
        return state;
      }

      const hasContentChanged = state.currentDraft.content !== content;
      return {
        currentDraft: {
          ...state.currentDraft,
          content,
          isEdited: state.currentDraft.isEdited || hasContentChanged,
        },
      };
    });
  },

  updateDraftAgentType: (agentType) => {
    set((state) => {
      if (!state.currentDraft) {
        return state;
      }

      return {
        currentDraft: {
          ...state.currentDraft,
          agentType,
          isEdited: true,
        },
      };
    });
  },

  executeDraft: async () => {
    const { currentDraft, isExecutingDraft } = get();
    if (!currentDraft || isExecutingDraft) {
      return;
    }

    set({ isExecutingDraft: true });

    try {
      const result = await transport.invoke<{ terminalId: string }>('executePrompt', currentDraft);
      const terminalStore = useTerminalStore.getState();
      terminalStore.setActiveTerminal(result.terminalId);

      const assistantInfoMessage = createAssistantMessage(
        `Terminal ${result.terminalId} gestartet mit deinem Prompt.`,
      );
      const assistantMessages = [assistantInfoMessage];

      try {
        const terminalsResponse = await transport.invoke<ListTerminalsResponse>('listTerminals');
        terminalStore.setTerminals(terminalsResponse.terminals);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Aktualisieren';
        assistantMessages.push(
          createAssistantMessage(
            `Hinweis: Terminal ${result.terminalId} wurde gestartet, die Terminal-Liste konnte aber nicht aktualisiert werden (${message}).`,
          ),
        );
      }

      set((state) => ({
        currentDraft: null,
        isExecutingDraft: false,
        messages: [...state.messages, ...assistantMessages],
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Ausführen';
      const assistantErrorMessage = createAssistantMessage(`Fehler: ${message}`);

      set((state) => ({
        isExecutingDraft: false,
        messages: [...state.messages, assistantErrorMessage],
      }));
    }
  },

  discardDraft: () => {
    set({ currentDraft: null });
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
