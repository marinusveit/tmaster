import { create } from 'zustand';
import type { AssistantMessage, CoachingLevel, Suggestion } from '@shared/types/assistant';

interface AssistantStoreState {
  isExpanded: boolean;
  messages: AssistantMessage[];
  suggestions: Suggestion[];
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
}

export type AssistantStore = AssistantStoreState & AssistantStoreActions;

const PLACEHOLDER_RESPONSES: Record<CoachingLevel, string[]> = {
  observe: [
    'Beobachtung notiert. Ich schaue mir das an.',
    'Verstanden — ich behalte das im Blick.',
    'Notiert. Ich beobachte den Verlauf.',
  ],
  suggest: [
    'Guter Punkt! Hast du schon versucht, die Logs zu pruefen?',
    'Ich wuerde vorschlagen, erst die Tests laufen zu lassen.',
    'Interessant — vielleicht hilft ein Blick in die Dokumentation.',
  ],
  coach: [
    'Lass uns das gemeinsam angehen. Was ist dein naechster Schritt?',
    'Gute Frage! Denk mal darueber nach, was der Root Cause sein koennte.',
    'Ich sehe Potenzial hier. Wie wuerdest du das refactoren?',
  ],
  act: [
    'Ich kuemmere mich darum. Einen Moment...',
    'Verstanden — ich fuehre das aus.',
    'Wird erledigt. Ich starte den Prozess.',
  ],
};

// Timeout-ID fuer Cleanup bei schnellem Senden
let typingTimeoutId: ReturnType<typeof setTimeout> | null = null;

export const useAssistantStore = create<AssistantStore>((set, get) => ({
  isExpanded: false,
  messages: [],
  suggestions: [],
  coachingLevel: 'suggest',
  isTyping: false,

  toggleExpanded: () => {
    set((state) => ({ isExpanded: !state.isExpanded }));
  },

  setExpanded: (expanded) => {
    set({ isExpanded: expanded });
  },

  addMessage: (message) => {
    set((state) => ({ messages: [...state.messages, message] }));
  },

  sendMessage: (content) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    // Vorherigen Timeout abbrechen falls vorhanden
    if (typingTimeoutId !== null) {
      clearTimeout(typingTimeoutId);
    }

    const userMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isTyping: true,
    }));

    // Placeholder-Antwort nach zufaelliger Verzoegerung
    const delay = 700 + Math.random() * 500;
    typingTimeoutId = setTimeout(() => {
      const { coachingLevel } = get();
      const responses = PLACEHOLDER_RESPONSES[coachingLevel];
      const text = responses[Math.floor(Math.random() * responses.length)] ?? responses[0];

      const assistantMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: text ?? '',
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isTyping: false,
      }));
      typingTimeoutId = null;
    }, delay);
  },

  clearMessages: () => {
    if (typingTimeoutId !== null) {
      clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }
    set({ messages: [], isTyping: false });
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
