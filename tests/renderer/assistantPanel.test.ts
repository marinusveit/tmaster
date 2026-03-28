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
      lastStreamingMessageId: null,
      pendingTerminalReplies: [],
      pendingReplyRequest: null,
      sendingTerminalReplyIds: [],
      suggestions: [],
      richSuggestions: [],
      coachingLevel: 'suggest',
      isTyping: false,
      currentDraft: null,
      isGeneratingDraft: false,
      isExecutingDraft: false,
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

  it('handleStreamChunk ignoriert finalen Leer-Chunk ohne Nachricht', () => {
    const store = useAssistantStore.getState();
    useAssistantStore.setState({ isTyping: true });

    store.handleStreamChunk({
      messageId: 'stream-1',
      text: '',
      isFinal: true,
    });

    const state = useAssistantStore.getState();
    expect(state.messages).toHaveLength(0);
    expect(state.isTyping).toBe(false);
  });
});

describe('useAssistant hook wiring', () => {
  it('subscribed beim Mount und cleanup beim Unmount', async () => {
    vi.resetModules();

    const cleanups: Array<() => void> = [];
    const unsubMessage = vi.fn();
    const unsubStreamChunk = vi.fn();
    const unsubSuggestion = vi.fn();
    const unsubTerminalEvent = vi.fn();
    const unsubTerminalData = vi.fn();
    const unsubTerminalExit = vi.fn();
    const unsubNotification = vi.fn();
    const unsubNotificationReplyRequest = vi.fn();
    const transportOn = vi
      .fn()
      .mockReturnValueOnce(unsubMessage)
      .mockReturnValueOnce(unsubStreamChunk)
      .mockReturnValueOnce(unsubSuggestion)
      .mockReturnValueOnce(unsubTerminalEvent)
      .mockReturnValueOnce(unsubTerminalData)
      .mockReturnValueOnce(unsubTerminalExit)
      .mockReturnValueOnce(unsubNotification)
      .mockReturnValueOnce(unsubNotificationReplyRequest);

    const addMessage = vi.fn();
    const handleStreamChunk = vi.fn();
    const addRichSuggestion = vi.fn();
    const handleTerminalEvent = vi.fn();
    const handleTerminalData = vi.fn();
    const handleTerminalExit = vi.fn();
    const handleNotification = vi.fn();
    const handleNotificationReplyRequest = vi.fn();

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
        getState: () => ({
          addMessage,
          handleStreamChunk,
          addRichSuggestion,
          handleTerminalEvent,
          handleTerminalData,
          handleTerminalExit,
          handleNotification,
          handleNotificationReplyRequest,
        }),
      },
    }));

    const { useAssistant } = await import('@renderer/hooks/useAssistant');
    useAssistant();

    expect(transportOn).toHaveBeenCalledTimes(8);

    const messageHandler = transportOn.mock.calls[0]?.[1] as ((payload: { id: string }) => void) | undefined;
    const streamChunkHandler = transportOn.mock.calls[1]?.[1] as ((payload: { messageId: string; text: string; isFinal: boolean }) => void) | undefined;
    const suggestionHandler = transportOn.mock.calls[2]?.[1] as ((payload: { id: string }) => void) | undefined;
    const terminalEventHandler = transportOn.mock.calls[3]?.[1] as ((payload: { terminalId: string }) => void) | undefined;
    const terminalDataHandler = transportOn.mock.calls[4]?.[1] as ((payload: { terminalId: string }) => void) | undefined;
    const terminalExitHandler = transportOn.mock.calls[5]?.[1] as ((payload: { terminalId: string }) => void) | undefined;
    const notificationHandler = transportOn.mock.calls[6]?.[1] as ((payload: { id: string }) => void) | undefined;
    const notificationReplyRequestHandler = transportOn.mock.calls[7]?.[1] as
      | ((payload: { terminalId: string; notificationId: string }) => void)
      | undefined;

    messageHandler?.({ id: 'm1' });
    streamChunkHandler?.({ messageId: 'c1', text: 'hello', isFinal: false });
    suggestionHandler?.({ id: 's1' });
    terminalEventHandler?.({ terminalId: 't1' });
    terminalDataHandler?.({ terminalId: 't1' });
    terminalExitHandler?.({ terminalId: 't1' });
    notificationHandler?.({ id: 'n1' });
    notificationReplyRequestHandler?.({ terminalId: 't1', notificationId: 'n1' });

    expect(addMessage).toHaveBeenCalled();
    expect(handleStreamChunk).toHaveBeenCalled();
    expect(addRichSuggestion).toHaveBeenCalled();
    expect(handleTerminalEvent).toHaveBeenCalled();
    expect(handleTerminalData).toHaveBeenCalled();
    expect(handleTerminalExit).toHaveBeenCalled();
    expect(handleNotification).toHaveBeenCalled();
    expect(handleNotificationReplyRequest).toHaveBeenCalled();

    cleanups[0]?.();

    expect(unsubMessage).toHaveBeenCalledTimes(1);
    expect(unsubStreamChunk).toHaveBeenCalledTimes(1);
    expect(unsubSuggestion).toHaveBeenCalledTimes(1);
    expect(unsubTerminalEvent).toHaveBeenCalledTimes(1);
    expect(unsubTerminalData).toHaveBeenCalledTimes(1);
    expect(unsubTerminalExit).toHaveBeenCalledTimes(1);
    expect(unsubNotification).toHaveBeenCalledTimes(1);
    expect(unsubNotificationReplyRequest).toHaveBeenCalledTimes(1);
  });
});
