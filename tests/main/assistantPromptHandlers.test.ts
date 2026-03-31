import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { registerAssistantHandlers } from '@main/ipc/registerAssistantHandlers';
import type { PromptDraft } from '@shared/types/assistant';

type HandlerFn = (event: unknown, payload: unknown) => unknown;

const createMockIpcMain = () => {
  const handlers = new Map<string, HandlerFn>();

  return {
    handle: vi.fn((channel: string, handler: HandlerFn) => {
      handlers.set(channel, handler);
    }),
    invoke: async (channel: string, payload: unknown, senderId = 1) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler for ${channel}`);
      }

      return handler({ sender: { id: senderId } }, payload);
    },
  };
};

const createDraft = (overrides: Partial<PromptDraft> = {}): PromptDraft => {
  return {
    id: 'draft-1',
    content: 'Fix auth bug',
    context: 'T3: auth tests failing',
    agentType: 'claude',
    workspaceId: 'ws-1',
    timestamp: Date.now(),
    isEdited: false,
    ...overrides,
  };
};

describe('assistant prompt handlers', () => {
  it('assistant:generatePrompt mit Intent gibt PromptDraft mit Kontext zurueck', async () => {
    const ipcMain = createMockIpcMain();

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage: vi.fn(),
      contextBroker: {
        buildPromptContext: vi.fn(() => 'T3: 2 failing tests in auth.guard.ts'),
      } as never,
      getActiveWorkspaceId: () => 'ws-1',
    });

    const draft = await ipcMain.invoke(IPC_CHANNELS.assistantGeneratePrompt, 'Fixe den Auth-Bug') as PromptDraft;

    expect(draft.workspaceId).toBe('ws-1');
    expect(draft.context).toContain('auth.guard.ts');
    expect(draft.content).toContain('Fixe den Auth-Bug');
    expect(draft.content).toContain('--- Kontext aus dem Workspace ---');
    expect(draft.agentType).toBe('claude');
  });

  it('assistant:generatePrompt mit leerem String wirft Fehler', async () => {
    const ipcMain = createMockIpcMain();

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage: vi.fn(),
      contextBroker: undefined,
    });

    await expect(ipcMain.invoke(IPC_CHANNELS.assistantGeneratePrompt, '   ')).rejects.toThrow(
      'Assistant intent is empty',
    );
  });

  it('assistant:generatePrompt verwendet den sender-spezifischen Workspace', async () => {
    const ipcMain = createMockIpcMain();
    const getActiveWorkspaceId = vi.fn((senderId?: number) => {
      return senderId === 42 ? 'ws-42' : 'ws-default';
    });

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage: vi.fn(),
      contextBroker: {
        buildPromptContext: vi.fn(() => 'Kontext'),
      } as never,
      getActiveWorkspaceId,
    });

    const draft = await ipcMain.invoke(IPC_CHANNELS.assistantGeneratePrompt, 'Fix bug', 42) as PromptDraft;

    expect(getActiveWorkspaceId).toHaveBeenCalledWith(42);
    expect(draft.workspaceId).toBe('ws-42');
  });

  it('assistant:executePrompt mit gueltigem Draft erstellt Terminal', async () => {
    const ipcMain = createMockIpcMain();
    const createTerminal = vi.fn(() => ({
      terminalId: 't-7',
      label: { prefix: 'T', index: 7 },
      workspaceId: 'ws-1',
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
    }));
    const writeTerminal = vi.fn();

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage: vi.fn(),
      contextBroker: undefined,
      createTerminal,
      writeTerminal,
      executeDelayMs: 0,
    });

    const result = await ipcMain.invoke(IPC_CHANNELS.assistantExecutePrompt, createDraft());

    expect(createTerminal).toHaveBeenCalledWith({ workspaceId: 'ws-1', shell: 'claude' });
    expect(writeTerminal).toHaveBeenCalledWith('t-7', 'Fix auth bug\n');
    expect(result).toEqual({ terminalId: 't-7' });
  });

  it('assistant:executePrompt mit generic Draft nutzt Agent-Fallback statt Shell', async () => {
    const ipcMain = createMockIpcMain();
    const createTerminal = vi.fn(() => ({
      terminalId: 't-8',
      label: { prefix: 'T', index: 8 },
      workspaceId: 'ws-1',
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
    }));
    const writeTerminal = vi.fn();

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage: vi.fn(),
      contextBroker: undefined,
      createTerminal,
      writeTerminal,
      executeDelayMs: 0,
    });

    const draft = createDraft({
      agentType: 'generic',
      content: 'Fixe den Auth-Bug',
    });
    const result = await ipcMain.invoke(IPC_CHANNELS.assistantExecutePrompt, draft);

    expect(createTerminal).toHaveBeenCalledWith({ workspaceId: 'ws-1', shell: 'claude' });
    expect(writeTerminal).toHaveBeenCalledWith('t-8', 'Fixe den Auth-Bug\n');
    expect(result).toEqual({ terminalId: 't-8' });
  });

  it('assistant:executePrompt mit ungueltigem agentType wirft Fehler', async () => {
    const ipcMain = createMockIpcMain();

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage: vi.fn(),
      contextBroker: undefined,
      createTerminal: vi.fn(),
      writeTerminal: vi.fn(),
      executeDelayMs: 0,
    });

    const invalidDraft = {
      ...createDraft(),
      agentType: 'unknown',
    };

    await expect(ipcMain.invoke(IPC_CHANNELS.assistantExecutePrompt, invalidDraft)).rejects.toThrow(
      'Invalid prompt draft payload',
    );
  });

  it('assistant:executePrompt lehnt leeren Kontext ab', async () => {
    const ipcMain = createMockIpcMain();

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage: vi.fn(),
      contextBroker: undefined,
      createTerminal: vi.fn(),
      writeTerminal: vi.fn(),
      executeDelayMs: 0,
    });

    const invalidDraft = createDraft({ context: '   ' });
    await expect(ipcMain.invoke(IPC_CHANNELS.assistantExecutePrompt, invalidDraft)).rejects.toThrow(
      'Invalid prompt draft payload',
    );
  });

  it('assistant:executePrompt lehnt Steuerzeichen im Prompt ab', async () => {
    const ipcMain = createMockIpcMain();

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage: vi.fn(),
      contextBroker: undefined,
      createTerminal: vi.fn(),
      writeTerminal: vi.fn(),
      executeDelayMs: 0,
    });

    const invalidDraft = createDraft({ content: 'Fix bug\u0000now' });
    await expect(ipcMain.invoke(IPC_CHANNELS.assistantExecutePrompt, invalidDraft)).rejects.toThrow(
      'Prompt contains unsupported control characters',
    );
  });
});
