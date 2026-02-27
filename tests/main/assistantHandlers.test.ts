import { describe, expect, it, vi } from 'vitest';
import { registerAssistantHandlers } from '@main/ipc/registerAssistantHandlers';
import { IPC_CHANNELS } from '@shared/ipc-channels';

type HandlerFn = (event: unknown, payload: unknown) => unknown;

const createMockIpcMain = () => {
  const handlers = new Map<string, HandlerFn>();
  return {
    handle: vi.fn((channel: string, handler: HandlerFn) => {
      handlers.set(channel, handler);
    }),
    invoke: (channel: string, payload: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler for ${channel}`);
      }

      return handler(null, payload);
    },
  };
};

describe('registerAssistantHandlers', () => {
  it('assistant:send mit validem Input erzeugt Antwort', () => {
    const ipcMain = createMockIpcMain();
    const onAssistantMessage = vi.fn();

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage,
      contextBroker: undefined,
    });

    ipcMain.invoke(IPC_CHANNELS.assistantSend, 'Wie ist der Status?');

    expect(onAssistantMessage).toHaveBeenCalledTimes(1);
    expect(onAssistantMessage.mock.calls[0]?.[0]?.content).toBeTruthy();
  });

  it('assistant:send mit leerem String wirft Fehler', () => {
    const ipcMain = createMockIpcMain();

    registerAssistantHandlers(ipcMain as never, {
      onAssistantMessage: vi.fn(),
      contextBroker: undefined,
    });

    expect(() => ipcMain.invoke(IPC_CHANNELS.assistantSend, '   ')).toThrow('Assistant message is empty');
  });
});
