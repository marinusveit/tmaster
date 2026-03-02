import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';
import { transport } from '@renderer/transport';

vi.mock('@renderer/transport', () => ({
  transport: {
    invoke: vi.fn(() => Promise.resolve(undefined)),
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  },
}));

describe('assistant panel store integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ workspaces: new Map(), activeWorkspaceId: 'ws1' });
    useAssistantStore.setState({
      isExpanded: false,
      messages: [],
      suggestions: [],
      richSuggestions: [],
      coachingLevel: 'suggest',
      isTyping: false,
    });
  });

  it('addRichSuggestion sortiert nach Priority', () => {
    const store = useAssistantStore.getState();

    store.addRichSuggestion({
      id: 'low',
      title: 'low',
      description: 'low',
      priority: 'low',
      terminalId: 't1',
      actions: [],
      timestamp: 1,
      category: 'workflow',
    });

    store.addRichSuggestion({
      id: 'high',
      title: 'high',
      description: 'high',
      priority: 'critical',
      terminalId: 't1',
      actions: [],
      timestamp: 2,
      category: 'error',
    });

    expect(useAssistantStore.getState().richSuggestions[0]?.id).toBe('high');
  });

  it('removeRichSuggestion entfernt korrekt', () => {
    const store = useAssistantStore.getState();

    store.addRichSuggestion({
      id: 'a',
      title: 'a',
      description: 'a',
      priority: 'high',
      actions: [],
      timestamp: 1,
      category: 'error',
    });

    store.removeRichSuggestion('a');
    expect(useAssistantStore.getState().richSuggestions).toHaveLength(0);
  });

  it('executeSuggestionAction ruft passende Transport-Calls auf', async () => {
    const store = useAssistantStore.getState();

    await store.executeSuggestionAction('s1', {
      type: 'new-terminal',
      label: 'Neu',
    });

    expect(transport.invoke).toHaveBeenCalledWith('createTerminal', { workspaceId: 'ws1' });
  });
});

describe('useAssistant hook wiring', () => {
  it('subscribed beim Mount und cleanup beim Unmount', async () => {
    vi.resetModules();

    const cleanups: Array<() => void> = [];
    const unsubMessage = vi.fn();
    const unsubSuggestion = vi.fn();
    const transportOn = vi
      .fn()
      .mockReturnValueOnce(unsubMessage)
      .mockReturnValueOnce(unsubSuggestion);

    const addMessage = vi.fn();
    const addRichSuggestion = vi.fn();

    vi.doMock('react', () => ({
      useEffect: (callback: () => void | (() => void)) => {
        const cleanup = callback();
        if (typeof cleanup === 'function') {
          cleanups.push(cleanup);
        }
      },
    }));

    vi.doMock('@renderer/transport', () => ({
      transport: {
        on: transportOn,
      },
    }));

    vi.doMock('@renderer/stores/assistantStore', () => ({
      useAssistantStore: {
        getState: () => ({ addMessage, addRichSuggestion }),
      },
    }));

    const { useAssistant } = await import('@renderer/hooks/useAssistant');
    useAssistant();

    expect(transportOn).toHaveBeenCalledTimes(2);

    const messageHandler = transportOn.mock.calls[0]?.[1] as ((payload: { id: string }) => void) | undefined;
    const suggestionHandler = transportOn.mock.calls[1]?.[1] as ((payload: { id: string }) => void) | undefined;

    messageHandler?.({ id: 'm1' });
    suggestionHandler?.({ id: 's1' });

    expect(addMessage).toHaveBeenCalled();
    expect(addRichSuggestion).toHaveBeenCalled();

    cleanups[0]?.();

    expect(unsubMessage).toHaveBeenCalledTimes(1);
    expect(unsubSuggestion).toHaveBeenCalledTimes(1);
  });
});
