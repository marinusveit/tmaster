import { useCallback, useEffect } from 'react';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { transport } from '@renderer/transport';
import type { CreateTerminalRequest, CreateTerminalResponse, ListTerminalsResponse, TerminalExitEvent, TerminalStatusEvent } from '@shared/types/terminal';

export const useTerminals = () => {
  const {
    terminals,
    activeTerminalId,
    addTerminal,
    removeTerminal,
    setActiveTerminal,
    updateStatus,
    getOrderedTerminals,
    getTerminalsByWorkspace,
    setTerminals,
  } = useTerminalStore();

  // Push-Events vom Main Process abonnieren
  useEffect(() => {
    const unsubExit = transport.on<TerminalExitEvent>('onTerminalExit', (event) => {
      updateStatus(event.terminalId, 'exited');
    });

    const unsubStatus = transport.on<TerminalStatusEvent>('onTerminalStatus', (event) => {
      updateStatus(event.terminalId, event.status);
    });

    return () => {
      unsubExit();
      unsubStatus();
    };
  }, [updateStatus]);

  const createTerminal = useCallback(async (request: CreateTerminalRequest = {}): Promise<CreateTerminalResponse> => {
    const response = await transport.invoke<CreateTerminalResponse>('createTerminal', request);
    addTerminal({
      terminalId: response.terminalId,
      label: response.label,
      workspaceId: response.workspaceId,
      status: 'active',
      createdAt: Date.now(),
    });
    setActiveTerminal(response.terminalId);
    return response;
  }, [addTerminal, setActiveTerminal]);

  const closeTerminal = useCallback(async (terminalId: string): Promise<void> => {
    await transport.invoke<void>('closeTerminal', { terminalId });
    removeTerminal(terminalId);
  }, [removeTerminal]);

  const switchTerminal = useCallback((terminalId: string): void => {
    setActiveTerminal(terminalId);
  }, [setActiveTerminal]);

  const loadTerminals = useCallback(async (): Promise<void> => {
    const response = await transport.invoke<ListTerminalsResponse>('listTerminals');
    setTerminals(response.terminals);
  }, [setTerminals]);

  return {
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    switchTerminal,
    loadTerminals,
    getOrderedTerminals,
    getTerminalsByWorkspace,
  };
};
