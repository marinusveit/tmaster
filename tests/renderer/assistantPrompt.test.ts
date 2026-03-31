import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transport } from '@renderer/transport';
import { isIntentMessage, useAssistantStore } from '@renderer/stores/assistantStore';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';
import type { PromptDraft } from '@shared/types/assistant';

vi.mock('@renderer/transport', () => ({
  transport: {
    invoke: vi.fn(() => Promise.resolve(undefined)),
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  },
}));

const createDraft = (overrides: Partial<PromptDraft> = {}): PromptDraft => {
  return {
    id: 'draft-1',
    content: 'Fix auth bug',
    context: 'T3: 2 failing tests',
    agentType: 'claude',
    workspaceId: 'ws1',
    timestamp: 1,
    isEdited: false,
    ...overrides,
  };
};

describe('assistant prompt collaboration store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ workspaces: new Map(), activeWorkspaceId: 'ws1' });
    useTerminalStore.setState({ terminals: new Map(), activeTerminalId: null, splitMode: 'single' });
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

  it('generatePrompt setzt currentDraft', async () => {
    const draft = createDraft();
    vi.mocked(transport.invoke).mockImplementation(async (channel: string) => {
      if (channel === 'generatePrompt') {
        return draft;
      }

      return undefined;
    });

    await useAssistantStore.getState().generatePrompt('Claude soll Auth fixen');

    expect(transport.invoke).toHaveBeenCalledWith('generatePrompt', 'Claude soll Auth fixen');
    expect(useAssistantStore.getState().currentDraft).toEqual(draft);
  });

  it('updateDraft aendert content und setzt isEdited', () => {
    useAssistantStore.setState({ currentDraft: createDraft() });

    useAssistantStore.getState().updateDraft('Neuer Prompt-Inhalt');

    const currentDraft = useAssistantStore.getState().currentDraft;
    expect(currentDraft?.content).toBe('Neuer Prompt-Inhalt');
    expect(currentDraft?.isEdited).toBe(true);
  });

  it('updateDraftAgentType aendert agentType', () => {
    useAssistantStore.setState({ currentDraft: createDraft({ agentType: 'generic' }) });

    useAssistantStore.getState().updateDraftAgentType('codex');

    expect(useAssistantStore.getState().currentDraft?.agentType).toBe('codex');
  });

  it('executeDraft ruft Transport auf und setzt currentDraft auf null', async () => {
    const draft = createDraft();
    useAssistantStore.setState({ currentDraft: draft });

    vi.mocked(transport.invoke).mockImplementation(async (channel: string) => {
      if (channel === 'executePrompt') {
        return { terminalId: 't9' };
      }

      if (channel === 'listTerminals') {
        return {
          terminals: [
            {
              terminalId: 't9',
              label: { prefix: 'T', index: 9 },
              workspaceId: 'ws1',
              status: 'active',
              createdAt: Date.now(),
              scrollback: 5000,
              protection: {
                mode: 'normal',
                reason: 'none',
                outputBytesPerSecond: 0,
                bufferedBytes: 0,
                thresholdBytesPerSecond: 1024 * 1024,
                warning: null,
                updatedAt: 0,
              },
            },
          ],
        };
      }

      return undefined;
    });

    await useAssistantStore.getState().executeDraft();

    expect(transport.invoke).toHaveBeenCalledWith('executePrompt', draft);
    expect(useAssistantStore.getState().currentDraft).toBeNull();
    expect(useTerminalStore.getState().activeTerminalId).toBe('t9');
  });

  it('discardDraft setzt currentDraft auf null', () => {
    useAssistantStore.setState({ currentDraft: createDraft() });

    useAssistantStore.getState().discardDraft();

    expect(useAssistantStore.getState().currentDraft).toBeNull();
  });

  it('Intent-Erkennung erkennt Arbeitsauftrag', () => {
    expect(isIntentMessage('Claude soll X bauen')).toBe(true);
  });

  it('Intent-Erkennung ignoriert reine Statusfrage', () => {
    expect(isIntentMessage('Wie ist der Status?')).toBe(false);
  });
});
