import { describe, expect, it, vi } from 'vitest';
import { registerBrokerHandlers } from '@main/ipc/registerBrokerHandlers';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { ContextResult } from '@shared/types/broker';

interface MockIpcMain {
  handle: ReturnType<typeof vi.fn>;
  invoke: (channel: string, payload?: unknown) => unknown;
}

type HandlerFn = (event: unknown, payload: unknown) => unknown;

const createMockIpcMain = (): MockIpcMain => {
  const handlers = new Map<string, HandlerFn>();

  return {
    handle: vi.fn((channel: string, handler: HandlerFn) => {
      handlers.set(channel, handler);
    }),
    invoke: (channel: string, payload?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler for ${channel}`);
      }

      return handler(null, payload);
    },
  };
};

describe('registerBrokerHandlers', () => {
  it('validiert ungültige Queries', () => {
    const ipcMain = createMockIpcMain();
    const contextBroker = {
      getContext: vi.fn(),
    };

    registerBrokerHandlers(ipcMain as never, contextBroker as never);

    expect(() => ipcMain.invoke(IPC_CHANNELS.brokerGetContext, { limit: 0 })).toThrow('Invalid context query: limit');
    expect(() => ipcMain.invoke(IPC_CHANNELS.brokerGetContext, { eventTypes: ['invalid'] })).toThrow('Invalid context query: eventTypes');
  });

  it('liefert ContextResult bei erfolgreicher Query', () => {
    const ipcMain = createMockIpcMain();
    const result: ContextResult = {
      events: [],
      activeTerminals: 2,
      recentErrors: 1,
      conflicts: [],
    };

    const contextBroker = {
      getContext: vi.fn(() => result),
    };

    registerBrokerHandlers(ipcMain as never, contextBroker as never);

    const response = ipcMain.invoke(IPC_CHANNELS.brokerGetContext, { workspaceId: 'ws1' }) as ContextResult;
    expect(contextBroker.getContext).toHaveBeenCalledWith({ workspaceId: 'ws1' });
    expect(response.activeTerminals).toBe(2);
  });

  it('liefert nur conflicts über broker:getConflicts', () => {
    const ipcMain = createMockIpcMain();
    const contextBroker = {
      getContext: vi.fn(() => ({
        events: [],
        activeTerminals: 0,
        recentErrors: 0,
        conflicts: [{ filePath: 'src/a.ts', terminalIds: ['t1', 't2'], detectedAt: 1 }],
      })),
    };

    registerBrokerHandlers(ipcMain as never, contextBroker as never);

    const response = ipcMain.invoke(IPC_CHANNELS.brokerGetConflicts, { workspaceId: 'ws1' }) as Array<{ filePath: string }>;
    expect(response).toHaveLength(1);
    expect(response[0]?.filePath).toBe('src/a.ts');
  });
});
