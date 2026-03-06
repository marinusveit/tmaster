import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';
import type { PromptDraft, RichSuggestion } from '@shared/types/assistant';
import { transport } from '@renderer/transport';

vi.mock('@renderer/transport', () => ({
  transport: {
    invoke: vi.fn(() => Promise.resolve(undefined)),
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  },
}));

describe('assistantStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalStore.setState({ terminals: new Map(), activeTerminalId: null, splitMode: 'single' });
    useWorkspaceStore.setState({ workspaces: new Map(), activeWorkspaceId: 'ws1' });
    useAssistantStore.setState({
      isExpanded: false,
      messages: [],
      suggestions: [],
      richSuggestions: [],
      coachingLevel: 'suggest',
      isTyping: false,
      currentDraft: null,
      isGeneratingDraft: false,
      isExecutingDraft: false,
    });
  });

  const createDraft = (): PromptDraft => {
    return {
      id: 'draft-1',
      content: 'Fix this bug',
      context: 'Terminal context',
      agentType: 'claude',
      workspaceId: 'ws1',
      timestamp: Date.now(),
      isEdited: false,
    };
  };

  it('addRichSuggestion sortiert nach Priority', () => {
    const store = useAssistantStore.getState();

    const low: RichSuggestion = {
      id: 's-low',
      title: 'low',
      description: 'low',
      priority: 'low',
      actions: [],
      timestamp: 1,
      category: 'workflow',
    };
    const critical: RichSuggestion = {
      id: 's-critical',
      title: 'critical',
      description: 'critical',
      priority: 'critical',
      actions: [],
      timestamp: 2,
      category: 'error',
    };

    store.addRichSuggestion(low);
    store.addRichSuggestion(critical);

    const result = useAssistantStore.getState().richSuggestions;
    expect(result[0]?.id).toBe('s-critical');
    expect(result[1]?.id).toBe('s-low');
  });

  it('removeRichSuggestion entfernt korrekt', () => {
    const store = useAssistantStore.getState();

    store.addRichSuggestion({
      id: 'a',
      title: 'A',
      description: 'A',
      priority: 'high',
      actions: [],
      timestamp: 1,
      category: 'error',
    });
    store.addRichSuggestion({
      id: 'b',
      title: 'B',
      description: 'B',
      priority: 'medium',
      actions: [],
      timestamp: 2,
      category: 'idle',
    });

    store.removeRichSuggestion('a');
    expect(useAssistantStore.getState().richSuggestions).toHaveLength(1);
    expect(useAssistantStore.getState().richSuggestions[0]?.id).toBe('b');
  });

  it('executeSuggestionAction dispatcht focus-terminal', async () => {
    const store = useAssistantStore.getState();

    await store.executeSuggestionAction('s1', {
      type: 'focus-terminal',
      label: 'Focus',
      payload: 't2',
    });

    expect(useTerminalStore.getState().activeTerminalId).toBe('t2');
  });

  it('executeSuggestionAction dispatcht close-terminal über Transport', async () => {
    const store = useAssistantStore.getState();

    useTerminalStore.getState().addTerminal({
      terminalId: 't1',
      label: { prefix: 'T', index: 1 },
      workspaceId: 'ws1',
      status: 'active',
      createdAt: Date.now(),
    });

    await store.executeSuggestionAction('s1', {
      type: 'close-terminal',
      label: 'Close',
      payload: 't1',
    });

    expect(transport.invoke).toHaveBeenCalledWith('closeTerminal', { terminalId: 't1' });
    expect(useTerminalStore.getState().terminals.size).toBe(0);
  });

  it('executeSuggestionAction dispatcht new-terminal über Transport', async () => {
    const store = useAssistantStore.getState();

    await store.executeSuggestionAction('s1', {
      type: 'new-terminal',
      label: 'New',
    });

    expect(transport.invoke).toHaveBeenCalledWith('createTerminal', { workspaceId: 'ws1' });
  });

  it('executeSuggestionAction dispatcht send-prompt über Transport', async () => {
    const store = useAssistantStore.getState();

    await store.executeSuggestionAction('s1', {
      type: 'send-prompt',
      label: 'Send',
      payload: 't5',
    });

    expect(transport.invoke).toHaveBeenCalledWith('writeTerminal', {
      terminalId: 't5',
      data: 'Bitte analysiere den letzten Fehler und schlage einen Fix vor.\n',
    });
  });

  it('sendMessage ruft assistant:send via Transport auf', () => {
    const store = useAssistantStore.getState();

    store.sendMessage('Status?');

    expect(transport.invoke).toHaveBeenCalledWith('sendAssistantMessage', 'Status?');
    expect(useAssistantStore.getState().messages).toHaveLength(1);
    expect(useAssistantStore.getState().isTyping).toBe(true);
  });

  it('executeDraft bleibt erfolgreich wenn listTerminals fehlschlaegt', async () => {
    const store = useAssistantStore.getState();
    useAssistantStore.setState({ currentDraft: createDraft() });

    vi.mocked(transport.invoke).mockImplementation(
      ((channel: string) => {
        if (channel === 'executePrompt') {
          return Promise.resolve({ terminalId: 't-created' });
        }
        if (channel === 'listTerminals') {
          return Promise.reject(new Error('IPC down'));
        }
        return Promise.resolve(undefined);
      }) as typeof transport.invoke,
    );

    await store.executeDraft();

    const state = useAssistantStore.getState();
    expect(state.currentDraft).toBeNull();
    expect(state.isExecutingDraft).toBe(false);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]?.content).toContain('Terminal t-created gestartet');
    expect(state.messages[1]?.content).toContain('konnte aber nicht aktualisiert werden');
    expect(state.messages.some((message) => message.content.startsWith('Fehler:'))).toBe(false);
    expect(useTerminalStore.getState().activeTerminalId).toBe('t-created');
  });
});
