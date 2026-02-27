import { describe, expect, it, vi } from 'vitest';
import { registerNotificationHandlers } from '@main/ipc/registerNotificationHandlers';
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

describe('registerNotificationHandlers', () => {
  it('dismisst Notification mit gültiger ID', () => {
    const ipcMain = createMockIpcMain();
    const notificationManager = {
      dismiss: vi.fn(),
    };

    registerNotificationHandlers(ipcMain as never, notificationManager as never);
    ipcMain.invoke(IPC_CHANNELS.notificationDismiss, 'n1');

    expect(notificationManager.dismiss).toHaveBeenCalledWith('n1');
  });

  it('wirft bei ungültiger ID', () => {
    const ipcMain = createMockIpcMain();
    const notificationManager = {
      dismiss: vi.fn(),
    };

    registerNotificationHandlers(ipcMain as never, notificationManager as never);

    expect(() => ipcMain.invoke(IPC_CHANNELS.notificationDismiss, { id: 'n1' })).toThrow('Invalid notification id');
  });
});
