import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import type { AssistantMessage, Suggestion } from '@shared/types/assistant';

describe('assistantStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAssistantStore.setState({
      isExpanded: false,
      messages: [],
      suggestions: [],
      coachingLevel: 'suggest',
      isTyping: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('toggled den Expanded-State', () => {
    const store = useAssistantStore.getState();

    expect(useAssistantStore.getState().isExpanded).toBe(false);
    store.toggleExpanded();
    expect(useAssistantStore.getState().isExpanded).toBe(true);
    store.toggleExpanded();
    expect(useAssistantStore.getState().isExpanded).toBe(false);
  });

  it('setzt Expanded direkt', () => {
    const store = useAssistantStore.getState();

    store.setExpanded(true);
    expect(useAssistantStore.getState().isExpanded).toBe(true);
    store.setExpanded(false);
    expect(useAssistantStore.getState().isExpanded).toBe(false);
  });

  it('fuegt Messages hinzu und loescht sie', () => {
    const store = useAssistantStore.getState();
    const msg: AssistantMessage = {
      id: 'msg1',
      role: 'user',
      content: 'Hallo!',
      timestamp: Date.now(),
    };

    store.addMessage(msg);
    expect(useAssistantStore.getState().messages).toHaveLength(1);
    expect(useAssistantStore.getState().messages[0]?.content).toBe('Hallo!');

    store.addMessage({ ...msg, id: 'msg2', role: 'assistant', content: 'Hi!' });
    expect(useAssistantStore.getState().messages).toHaveLength(2);

    store.clearMessages();
    expect(useAssistantStore.getState().messages).toHaveLength(0);
  });

  it('setzt und entfernt Suggestions', () => {
    const store = useAssistantStore.getState();
    const suggestions: Suggestion[] = [
      { id: 's1', title: 'Fix auth', description: 'Auth error detected', timestamp: Date.now() },
      { id: 's2', title: 'Run tests', description: '3 tests pending', timestamp: Date.now() },
    ];

    store.setSuggestions(suggestions);
    expect(useAssistantStore.getState().suggestions).toHaveLength(2);

    store.removeSuggestion('s1');
    expect(useAssistantStore.getState().suggestions).toHaveLength(1);
    expect(useAssistantStore.getState().suggestions[0]?.id).toBe('s2');
  });

  it('aendert das Coaching-Level', () => {
    const store = useAssistantStore.getState();

    expect(useAssistantStore.getState().coachingLevel).toBe('suggest');

    store.setCoachingLevel('observe');
    expect(useAssistantStore.getState().coachingLevel).toBe('observe');

    store.setCoachingLevel('coach');
    expect(useAssistantStore.getState().coachingLevel).toBe('coach');

    store.setCoachingLevel('act');
    expect(useAssistantStore.getState().coachingLevel).toBe('act');
  });

  describe('sendMessage', () => {
    it('erstellt User-Message und setzt isTyping auf true', () => {
      const store = useAssistantStore.getState();

      store.sendMessage('Hallo AI!');

      const state = useAssistantStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.role).toBe('user');
      expect(state.messages[0]?.content).toBe('Hallo AI!');
      expect(state.isTyping).toBe(true);
    });

    it('ignoriert leere Nachrichten', () => {
      const store = useAssistantStore.getState();

      store.sendMessage('   ');

      const state = useAssistantStore.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.isTyping).toBe(false);
    });

    it('generiert Placeholder-Antwort nach Verzoegerung', () => {
      const store = useAssistantStore.getState();

      store.sendMessage('Test-Nachricht');

      // Vor Timeout: nur User-Message, isTyping true
      expect(useAssistantStore.getState().messages).toHaveLength(1);
      expect(useAssistantStore.getState().isTyping).toBe(true);

      // Timeout ausfuehren (max 1200ms)
      vi.advanceTimersByTime(1200);

      // Nach Timeout: User + Assistant Message, isTyping false
      const state = useAssistantStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[1]?.role).toBe('assistant');
      expect(state.messages[1]?.content).toBeTruthy();
      expect(state.isTyping).toBe(false);
    });

    it('Antwort variiert je nach coachingLevel observe', () => {
      useAssistantStore.setState({ coachingLevel: 'observe' });
      const store = useAssistantStore.getState();

      store.sendMessage('Test');
      vi.advanceTimersByTime(1200);

      const response = useAssistantStore.getState().messages[1]?.content ?? '';
      const observeKeywords = ['Beobachtung', 'beobachte', 'Blick'];
      expect(observeKeywords.some((kw) => response.includes(kw))).toBe(true);
    });

    it('Antwort variiert je nach coachingLevel act', () => {
      useAssistantStore.setState({ coachingLevel: 'act' });
      const store = useAssistantStore.getState();

      store.sendMessage('Mach das');
      vi.advanceTimersByTime(1200);

      const response = useAssistantStore.getState().messages[1]?.content ?? '';
      const actKeywords = ['kuemmere', 'fuehre', 'erledigt'];
      expect(actKeywords.some((kw) => response.includes(kw))).toBe(true);
    });

    it('clearMessages bricht laufenden Timeout ab', () => {
      const store = useAssistantStore.getState();

      store.sendMessage('Wird abgebrochen');
      expect(useAssistantStore.getState().isTyping).toBe(true);

      store.clearMessages();
      expect(useAssistantStore.getState().messages).toHaveLength(0);
      expect(useAssistantStore.getState().isTyping).toBe(false);

      // Timeout sollte keine Nachricht mehr erzeugen
      vi.advanceTimersByTime(1200);
      expect(useAssistantStore.getState().messages).toHaveLength(0);
    });
  });
});
