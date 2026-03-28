import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { registerTerminalHandlers } from '@main/ipc/registerTerminalHandlers';

type HandlerFn = (event: unknown, payload: unknown) => unknown;

const createMockIpcMain = () => {
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

const createTerminalManagerMock = () => {
  return {
    createTerminal: vi.fn(() => ({
      terminalId: 't-1',
      label: { prefix: 'T', index: 1 },
      workspaceId: 'ws-1',
    })),
    writeTerminal: vi.fn(),
    sendInput: vi.fn(),
    resizeTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    listTerminals: vi.fn(() => []),
  };
};

describe('registerTerminalHandlers', () => {
  it('erstellt ein Terminal via IPC', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    const result = ipcMain.invoke(IPC_CHANNELS.terminalCreate, { cwd: '/tmp', workspaceId: 'ws-1' }) as {
      terminalId: string;
      workspaceId: string;
    };

    expect(result.terminalId).toBe('t-1');
    expect(result.workspaceId).toBe('ws-1');
    expect(terminalManager.createTerminal).toHaveBeenCalledWith({
      cwd: '/tmp',
      shell: undefined,
      workspaceId: 'ws-1',
      label: undefined,
    });
  });

  it('akzeptiert leeren/ungültigen create payload als Default-Request', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    ipcMain.invoke(IPC_CHANNELS.terminalCreate, null);
    expect(terminalManager.createTerminal).toHaveBeenCalledWith({});
  });

  it('schreibt in ein Terminal via IPC', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    ipcMain.invoke(IPC_CHANNELS.terminalWrite, { terminalId: 't-1', data: 'ls\n' });
    expect(terminalManager.writeTerminal).toHaveBeenCalledWith('t-1', 'ls\n');
  });

  it('wirft bei ungültigem write payload', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    expect(() => ipcMain.invoke(IPC_CHANNELS.terminalWrite, { terminalId: 't-1' })).toThrow(
      'Invalid write payload',
    );
  });

  it('sendet Terminal-Input via IPC', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    ipcMain.invoke(IPC_CHANNELS.terminalSendInput, { terminalId: 't-1', input: 'yes' });
    expect(terminalManager.sendInput).toHaveBeenCalledWith('t-1', 'yes');
  });

  it('wirft bei ungültigem sendInput payload', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    expect(() => ipcMain.invoke(IPC_CHANNELS.terminalSendInput, { terminalId: 't-1' })).toThrow(
      'Invalid sendInput payload',
    );
  });

  it('resized ein Terminal via IPC', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    ipcMain.invoke(IPC_CHANNELS.terminalResize, { terminalId: 't-1', cols: 120, rows: 40 });
    expect(terminalManager.resizeTerminal).toHaveBeenCalledWith('t-1', 120, 40);
  });

  it('wirft bei ungültigem resize payload', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    expect(() => ipcMain.invoke(IPC_CHANNELS.terminalResize, { terminalId: 't-1', cols: 0, rows: 20 })).toThrow(
      'Invalid resize payload',
    );
  });

  it('schließt ein Terminal via IPC', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    ipcMain.invoke(IPC_CHANNELS.terminalClose, { terminalId: 't-1' });
    expect(terminalManager.closeTerminal).toHaveBeenCalledWith('t-1');
  });

  it('wirft bei ungültigem close payload', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    expect(() => ipcMain.invoke(IPC_CHANNELS.terminalClose, {})).toThrow('Invalid close payload');
  });

  it('liefert Terminal-Liste via IPC', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    terminalManager.listTerminals.mockReturnValue([
      {
        terminalId: 't-1',
        label: { prefix: 'T', index: 1 },
        workspaceId: 'ws-1',
        status: 'active',
        createdAt: 1,
      },
    ]);
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    const result = ipcMain.invoke(IPC_CHANNELS.terminalList) as { terminals: Array<{ terminalId: string }> };
    expect(result.terminals).toHaveLength(1);
    expect(result.terminals[0]?.terminalId).toBe('t-1');
  });
});
