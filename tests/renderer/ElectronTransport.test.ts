import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElectronTransport } from '@renderer/transport/ElectronTransport';

const mockApi = {
  createTerminal: vi.fn(),
  writeTerminal: vi.fn(),
  sendTerminalInput: vi.fn(),
  resizeTerminal: vi.fn(),
  closeTerminal: vi.fn(),
  listTerminals: vi.fn(),
  onTerminalData: vi.fn(),
  onTerminalExit: vi.fn(),
  onTerminalStatus: vi.fn(),
  onTerminalEvent: vi.fn(),
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  switchWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  getPreferences: vi.fn(),
  setPreference: vi.fn(),
  listSessions: vi.fn(),
  getContext: vi.fn(),
  onConflict: vi.fn(),
  onFileChange: vi.fn(),
  sendAssistantMessage: vi.fn(),
  generatePrompt: vi.fn(),
  executePrompt: vi.fn(),
  onAssistantMessage: vi.fn(),
  onAssistantStreamChunk: vi.fn(),
  onSuggestion: vi.fn(),
  onNotification: vi.fn(),
  onNotificationReplyRequest: vi.fn(),
  dismissNotification: vi.fn(),
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
