import { beforeEach, describe, expect, it } from 'vitest';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import type { AssistantMessage, Suggestion } from '@shared/types/assistant';

describe('assistantStore', () => {
  beforeEach(() => {
    useAssistantStore.setState({
      isExpanded: false,
      messages: [],
      suggestions: [],
      coachingLevel: 'suggest',
    });
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
});
