import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElectronTransport } from '@renderer/transport/ElectronTransport';

const mockApi = {
  createTerminal: vi.fn(),
  writeTerminal: vi.fn(),
  resizeTerminal: vi.fn(),
  closeTerminal: vi.fn(),
  listTerminals: vi.fn(),
  onTerminalData: vi.fn(),
  onTerminalExit: vi.fn(),
  onTerminalStatus: vi.fn(),
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  switchWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
};

describe('ElectronTransport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(globalThis, { window: { tmaster: mockApi } });
  });

  it('delegiert invoke an die korrekte API-Methode', async () => {
    mockApi.createTerminal.mockResolvedValue({ terminalId: 'abc', label: { prefix: 'T', index: 1 }, workspaceId: 'ws1' });

    const transport = new ElectronTransport();
    const result = await transport.invoke('createTerminal', {});

    expect(mockApi.createTerminal).toHaveBeenCalledWith({});
    expect(result).toEqual({ terminalId: 'abc', label: { prefix: 'T', index: 1 }, workspaceId: 'ws1' });
  });

  it('wirft bei unbekanntem Channel', async () => {
    const transport = new ElectronTransport();
    await expect(transport.invoke('unknownChannel')).rejects.toThrow('Unknown channel');
  });

  it('registriert Event-Listener über on()', () => {
    const unsubscribe = vi.fn();
    mockApi.onTerminalData.mockReturnValue(unsubscribe);

    const transport = new ElectronTransport();
    const handler = vi.fn();
    const cleanup = transport.on('onTerminalData', handler);

    expect(mockApi.onTerminalData).toHaveBeenCalledWith(handler);

    cleanup();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('wirft wenn window.tmaster nicht verfügbar', async () => {
    Object.assign(globalThis, { window: {} });

    const transport = new ElectronTransport();
    await expect(transport.invoke('createTerminal', {})).rejects.toThrow('window.tmaster is not available');
  });
});
