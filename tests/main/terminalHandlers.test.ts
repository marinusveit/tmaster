import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { registerTerminalHandlers } from '@main/ipc/registerTerminalHandlers';

const mocks = vi.hoisted(() => {
  return {
    browserWindowFromWebContents: vi.fn(),
    clipboardWriteText: vi.fn(),
    showSaveDialog: vi.fn(),
    writeFile: vi.fn(),
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: mocks.browserWindowFromWebContents,
  },
  clipboard: {
    writeText: mocks.clipboardWriteText,
  },
  dialog: {
    showSaveDialog: mocks.showSaveDialog,
  },
}));

vi.mock('node:fs/promises', () => ({
  writeFile: mocks.writeFile,
}));

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

      return handler({ sender: {} }, payload);
    },
  };
};

const createTerminalManagerMock = () => {
  return {
    createTerminal: vi.fn(() => ({
      terminalId: 't-1',
      label: { prefix: 'T', index: 1 },
      workspaceId: 'ws-1',
      displayOrder: 1,
    })),
    writeTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    reorderTerminals: vi.fn(),
    listTerminals: vi.fn(() => []),
    getSession: vi.fn(() => ({
      label: { prefix: 'T', index: 1 },
    })),
  };
};

describe('registerTerminalHandlers', () => {
  beforeEach(() => {
    mocks.browserWindowFromWebContents.mockReset();
    mocks.clipboardWriteText.mockReset();
    mocks.showSaveDialog.mockReset();
    mocks.writeFile.mockReset();
  });

  it('kopiert Terminal-Buffer via IPC in die Zwischenablage', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    ipcMain.invoke(IPC_CHANNELS.terminalCopyBuffer, {
      terminalId: 't-1',
      content: 'hello world',
      scope: 'full',
    });

    expect(mocks.clipboardWriteText).toHaveBeenCalledWith('hello world');
  });

  it('speichert Terminal-Buffer via IPC als Datei', async () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/T1-output.txt' });
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    const result = await ipcMain.invoke(IPC_CHANNELS.terminalSaveBuffer, {
      terminalId: 't-1',
      content: 'line 1\nline 2',
      scope: 'full',
    });

    expect(result).toBe(true);
    expect(mocks.showSaveDialog).toHaveBeenCalledTimes(1);
    expect(mocks.writeFile).toHaveBeenCalledWith('/tmp/T1-output.txt', 'line 1\nline 2', 'utf8');
  });

  it('bricht Datei-Export sauber ab wenn der Dialog abgebrochen wird', async () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    const result = await ipcMain.invoke(IPC_CHANNELS.terminalSaveBuffer, {
      terminalId: 't-1',
      content: '',
      scope: 'visible',
    });

    expect(result).toBe(false);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

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

  it('wirft bei ungültigem export payload', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    expect(() => ipcMain.invoke(IPC_CHANNELS.terminalCopyBuffer, { terminalId: 't-1', scope: 'full' })).toThrow(
      'Invalid export payload',
    );
  });

  it('liefert Terminal-Liste via IPC', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    terminalManager.listTerminals.mockReturnValue([
      {
        terminalId: 't-1',
        label: { prefix: 'T', index: 1 },
        workspaceId: 'ws-1',
        displayOrder: 1,
        status: 'active',
        createdAt: 1,
      },
    ]);
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    const result = ipcMain.invoke(IPC_CHANNELS.terminalList) as { terminals: Array<{ terminalId: string }> };
    expect(result.terminals).toHaveLength(1);
    expect(result.terminals[0]?.terminalId).toBe('t-1');
  });

  it('ordnet Terminals via IPC neu an', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    ipcMain.invoke(IPC_CHANNELS.terminalReorder, {
      workspaceId: 'ws-1',
      orderedTerminalIds: ['t-2', 't-1'],
    });

    expect(terminalManager.reorderTerminals).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      orderedTerminalIds: ['t-2', 't-1'],
    });
  });

  it('wirft bei ungültigem reorder payload', () => {
    const ipcMain = createMockIpcMain();
    const terminalManager = createTerminalManagerMock();
    registerTerminalHandlers(ipcMain as never, terminalManager as never);

    expect(() => ipcMain.invoke(IPC_CHANNELS.terminalReorder, {
      workspaceId: 'ws-1',
      orderedTerminalIds: ['t-1', 't-1'],
    })).toThrow('Invalid reorder payload');
  });
});
