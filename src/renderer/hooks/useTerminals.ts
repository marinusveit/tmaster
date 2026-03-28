import { useCallback, useEffect } from 'react';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { transport } from '@renderer/transport';
import { destroyTerminalInstance } from '@renderer/components/terminal/terminalInstances';
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  ListTerminalsResponse,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalStatusEvent,
} from '@shared/types/terminal';
import type { TerminalEvent } from '@shared/types/event';

const WAITING_OUTPUT_REGEX = /(?:waiting\s+for\s+input|⏳|\[[Yy]\/[Nn]\]|\[[Yy]es\/[Nn]o\]|\([Yy]\/[Nn]\)|\(yes\/no\)|press\s+enter|hit\s+enter|confirm|continue\?)/i;

export const useTerminals = () => {
  const {
    terminals,
    activeTerminalId,
    addTerminal,
    removeTerminal,
    setActiveTerminal,
    updateStatus,
    setWaitingState,
    clearWaitingState,
    getOrderedTerminals,
    getTerminalsByWorkspace,
    setTerminals,
  } = useTerminalStore();

  // Push-Events vom Main Process abonnieren
  useEffect(() => {
    const unsubExit = transport.on<TerminalExitEvent>('onTerminalExit', (event) => {
      // xterm-Instanz aufräumen und Terminal aus dem Store entfernen.
      // Der PTY ist bereits beendet, kein IPC-Close nötig.
      destroyTerminalInstance(event.terminalId);
      removeTerminal(event.terminalId);
    });

    const unsubStatus = transport.on<TerminalStatusEvent>('onTerminalStatus', (event) => {
      updateStatus(event.terminalId, event.status);
    });

    const unsubEvent = transport.on<TerminalEvent>('onTerminalEvent', (event) => {
      if (event.type === 'waiting') {
        setWaitingState(event.terminalId, event.summary, event.timestamp);
        return;
      }

      clearWaitingState(event.terminalId);
    });

    const unsubData = transport.on<TerminalDataEvent>('onTerminalData', (event) => {
      const terminal = useTerminalStore.getState().terminals.get(event.terminalId);
      if (!terminal?.isWaiting) {
        return;
      }

      if (!WAITING_OUTPUT_REGEX.test(event.data)) {
        clearWaitingState(event.terminalId);
      }
    });

    return () => {
      unsubExit();
      unsubStatus();
      unsubEvent();
      unsubData();
    };
  }, [clearWaitingState, removeTerminal, setWaitingState, updateStatus]);

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
    destroyTerminalInstance(terminalId);
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
