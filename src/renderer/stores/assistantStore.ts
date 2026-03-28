import { create } from 'zustand';
import type {
  AssistantMessage,
  AssistantStreamChunk,
  CoachingLevel,
  PromptAgentType,
  PromptDraft,
  RichSuggestion,
  Suggestion,
  SuggestionAction,
  SuggestionPriority,
} from '@shared/types/assistant';
import type { TerminalEvent } from '@shared/types/event';
import type { AppNotification, NotificationReplyRequest } from '@shared/types/notification';
import type {
  CreateTerminalResponse,
  ListTerminalsResponse,
  TerminalDataEvent,
} from '@shared/types/terminal';
import { transport } from '@renderer/transport';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';

export interface WaitingTerminalReply {
  terminalId: string;
  terminalLabel: string;
  question: string;
  detectedAt: number;
  notificationId?: string;
}

interface PendingReplyRequest {
  terminalId: string;
  requestedAt: number;
  notificationId?: string;
}

interface AssistantStoreState {
  isExpanded: boolean;
  messages: AssistantMessage[];
  lastStreamingMessageId: string | null;
  suggestions: Suggestion[];
  richSuggestions: RichSuggestion[];
  pendingTerminalReplies: WaitingTerminalReply[];
  pendingReplyRequest: PendingReplyRequest | null;
  sendingTerminalReplyIds: string[];
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
  sendTerminalReply: (terminalId: string, input: string) => Promise<void>;
  handleTerminalEvent: (event: TerminalEvent) => void;
  handleTerminalData: (event: TerminalDataEvent) => void;
  handleTerminalExit: (terminalId: string) => void;
  handleNotification: (notification: AppNotification) => void;
  handleNotificationReplyRequest: (request: NotificationReplyRequest) => void;
  clearPendingReplyRequest: () => void;
  handleStreamChunk: (chunk: AssistantStreamChunk) => void;
}

export type AssistantStore = AssistantStoreState & AssistantStoreActions;

const MAX_MESSAGES = 500;
const WAITING_MARKER_REGEX = /waiting\s+for\s+input|⏳/i;
const ANSI_ESCAPE_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

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

const stripAnsi = (value: string): string => {
  return value.replace(ANSI_ESCAPE_REGEX, '');
};

const resolveTerminalLabel = (terminalId: string): string => {
  const terminal = useTerminalStore.getState().terminals.get(terminalId);
  if (!terminal) {
    return terminalId;
  }

  return `${terminal.label.prefix}${terminal.label.index}`;
};

const extractWaitingQuestion = (event: Pick<TerminalEvent, 'summary' | 'details'>): string => {
  const summary = event.summary.trim();
  if (summary && !WAITING_MARKER_REGEX.test(summary)) {
    return summary;
  }

  const lines = event.details
    ?.split(/\r?\n/)
    .map((line) => stripAnsi(line).trim())
    .filter((line) => line.length > 0);

  if (lines) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line || WAITING_MARKER_REGEX.test(line)) {
        continue;
      }

      return line;
    }
  }

  return summary || 'Waiting for input';
};

const TERMINAL_MANAGEMENT_PATTERNS = [
  /(?:ein\s+)?neues\s+terminal/i,
  /terminal\s+(?:öffnen|starten|erstellen|aufmachen)/i,
  /(?:open|create|new)\s+(?:a\s+)?terminal/i,
] as const;

export const isTerminalManagementCommand = (content: string): boolean => {
  const normalized = content.trim();
  if (!normalized) {
    return false;
  }

  return TERMINAL_MANAGEMENT_PATTERNS.some((pattern) => pattern.test(normalized));
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

const removePendingReplyFromState = (
  state: AssistantStoreState,
  terminalId: string,
): Pick<AssistantStoreState, 'pendingTerminalReplies' | 'sendingTerminalReplyIds' | 'pendingReplyRequest'> => {
  const pendingReplyRequest = state.pendingReplyRequest?.terminalId === terminalId
    ? null
    : state.pendingReplyRequest;

  return {
    pendingTerminalReplies: state.pendingTerminalReplies.filter((reply) => reply.terminalId !== terminalId),
    sendingTerminalReplyIds: state.sendingTerminalReplyIds.filter((id) => id !== terminalId),
    pendingReplyRequest,
  };
};

const upsertPendingReply = (
  replies: WaitingTerminalReply[],
  nextReply: WaitingTerminalReply,
): WaitingTerminalReply[] => {
  const existingIndex = replies.findIndex((reply) => reply.terminalId === nextReply.terminalId);
  if (existingIndex === -1) {
    return [nextReply, ...replies].sort((a, b) => b.detectedAt - a.detectedAt);
  }

  const nextReplies = [...replies];
  nextReplies[existingIndex] = {
    ...nextReplies[existingIndex],
    ...nextReply,
  };
  return nextReplies.sort((a, b) => b.detectedAt - a.detectedAt);
};

const resolveStreamingMessageIndex = (
  messages: AssistantMessage[],
  messageId: string,
  lastStreamingMessageId: string | null,
): number => {
  const latestIndex = messages.length - 1;
  if (
    lastStreamingMessageId === messageId
    && latestIndex >= 0
    && messages[latestIndex]?.id === messageId
  ) {
    return latestIndex;
  }

  for (let index = latestIndex; index >= 0; index -= 1) {
    if (messages[index]?.id === messageId) {
      return index;
    }
  }

  return -1;
};

export const useAssistantStore = create<AssistantStore>((set, get) => ({
  isExpanded: false,
  messages: [],
  lastStreamingMessageId: null,
  suggestions: [],
  richSuggestions: [],
  pendingTerminalReplies: [],
  pendingReplyRequest: null,
  sendingTerminalReplyIds: [],
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
    set((state) => {
      const next = [...state.messages, message];
      const capped = next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
      return {
        messages: capped,
        lastStreamingMessageId: null,
        isTyping: message.role === 'assistant' ? false : state.isTyping,
      };
    });
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

    if (isTerminalManagementCommand(trimmed)) {
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      void transport
        .invoke<CreateTerminalResponse>('createTerminal', {
          workspaceId: activeWorkspaceId ?? undefined,
        })
        .then((response) => {
          const terminalStore = useTerminalStore.getState();
          terminalStore.addTerminal({
            terminalId: response.terminalId,
            label: response.label,
            workspaceId: response.workspaceId,
            displayOrder: response.displayOrder ?? response.label.index,
            status: 'active',
            createdAt: Date.now(),
          });
          terminalStore.setActiveTerminal(response.terminalId);

          const displayLabel = `${response.label.prefix}${response.label.index}`;
          const confirmMessage = createAssistantMessage(
            `Terminal ${displayLabel} geöffnet.`,
          );
          set((state) => ({
            messages: [...state.messages, confirmMessage],
            isTyping: false,
          }));
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
          const errorMessage = createAssistantMessage(`Fehler beim Erstellen: ${message}`);
          set((state) => ({
            messages: [...state.messages, errorMessage],
            isTyping: false,
          }));
        });
      return;
    }

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
    set({ messages: [], lastStreamingMessageId: null, isTyping: false });
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

  sendTerminalReply: async (terminalId, input) => {
    const normalizedInput = input.replace(/\r\n/g, '\n').trim();
    if (!normalizedInput) {
      return;
    }

    const existingReply = get().pendingTerminalReplies.find((reply) => reply.terminalId === terminalId);
    const terminalLabel = existingReply?.terminalLabel ?? resolveTerminalLabel(terminalId);

    set((state) => ({
      sendingTerminalReplyIds: state.sendingTerminalReplyIds.includes(terminalId)
        ? state.sendingTerminalReplyIds
        : [...state.sendingTerminalReplyIds, terminalId],
    }));

    try {
      await transport.invoke<void>('sendTerminalInput', {
        terminalId,
        input: normalizedInput,
      });

      set((state) => {
        const nextMessages = [
          ...state.messages,
          createAssistantMessage(`Antwort an ${terminalLabel} gesendet.`),
        ];
        const cappedMessages = nextMessages.length > MAX_MESSAGES
          ? nextMessages.slice(-MAX_MESSAGES)
          : nextMessages;

        return {
          ...removePendingReplyFromState(state, terminalId),
          messages: cappedMessages,
        };
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Senden';
      set((state) => ({
        sendingTerminalReplyIds: state.sendingTerminalReplyIds.filter((id) => id !== terminalId),
        messages: [...state.messages, createAssistantMessage(`Fehler beim Antworten an ${terminalLabel}: ${message}`)],
      }));
    }
  },

  handleTerminalEvent: (event) => {
    if (event.type !== 'waiting') {
      return;
    }

    set((state) => ({
      pendingTerminalReplies: upsertPendingReply(state.pendingTerminalReplies, {
        terminalId: event.terminalId,
        terminalLabel: resolveTerminalLabel(event.terminalId),
        question: extractWaitingQuestion(event),
        detectedAt: event.timestamp,
      }),
    }));
  },

  handleTerminalData: (event) => {
    set((state) => {
      if (!state.pendingTerminalReplies.some((reply) => reply.terminalId === event.terminalId)) {
        return state;
      }

      if (WAITING_MARKER_REGEX.test(event.data)) {
        return state;
      }

      return removePendingReplyFromState(state, event.terminalId);
    });
  },

  handleTerminalExit: (terminalId) => {
    set((state) => removePendingReplyFromState(state, terminalId));
  },

  handleNotification: (notification) => {
    if (notification.action?.type !== 'reply-terminal' || !notification.terminalId) {
      return;
    }

    const terminalId = notification.terminalId;
    set((state) => ({
      pendingTerminalReplies: upsertPendingReply(state.pendingTerminalReplies, {
        terminalId,
        terminalLabel: resolveTerminalLabel(terminalId),
        question: notification.body,
        detectedAt: notification.timestamp,
        notificationId: notification.id,
      }),
    }));
  },

  handleNotificationReplyRequest: (request) => {
    set({
      isExpanded: true,
      pendingReplyRequest: {
        terminalId: request.terminalId,
        notificationId: request.notificationId,
        requestedAt: Date.now(),
      },
    });
  },

  clearPendingReplyRequest: () => {
    set({ pendingReplyRequest: null });
  },

  handleStreamChunk: (chunk) => {
    set((state) => {
      const existingIndex = resolveStreamingMessageIndex(
        state.messages,
        chunk.messageId,
        state.lastStreamingMessageId,
      );

      if (existingIndex === -1) {
        if (chunk.isFinal && chunk.text.length === 0) {
          return {
            isTyping: false,
            lastStreamingMessageId: null,
          };
        }

        // Erster Chunk: neue Nachricht anlegen
        const newMessage: AssistantMessage = {
          id: chunk.messageId,
          role: 'assistant',
          content: chunk.text,
          timestamp: Date.now(),
          isStreaming: !chunk.isFinal,
        };
        const next = [...state.messages, newMessage];
        const capped = next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
        return {
          messages: capped,
          lastStreamingMessageId: chunk.isFinal ? null : chunk.messageId,
          isTyping: !chunk.isFinal,
        };
      }

      // Folge-Chunk: Text appenden
      const updated = [...state.messages];
      const existing = updated[existingIndex];
      if (!existing) {
        return state;
      }

      updated[existingIndex] = {
        ...existing,
        content: existing.content + chunk.text,
        isStreaming: !chunk.isFinal,
      };

      return {
        messages: updated,
        lastStreamingMessageId: chunk.isFinal ? null : chunk.messageId,
        isTyping: !chunk.isFinal,
      };
    });
  },
}));
