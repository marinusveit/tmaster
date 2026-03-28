import { useCallback, useEffect } from 'react';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { transport } from '@renderer/transport';
import { destroyTerminalInstance } from '@renderer/components/terminal/terminalInstances';
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  ListTerminalsResponse,
  ReorderTerminalsRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalStatusEvent,
} from '@shared/types/terminal';
import type { TerminalEvent } from '@shared/types/event';
import type { UiState } from '@shared/types/uiState';

const WAITING_OUTPUT_REGEX = /(?:waiting\s+for\s+input|⏳|\[[Yy]\/[Nn]\]|\[[Yy]es\/[Nn]o\]|\([Yy]\/[Nn]\)|\(yes\/no\)|press\s+enter|hit\s+enter|confirm|continue\?)/i;

export const useTerminals = () => {
  const {
    terminals,
    activeTerminalId,
    addTerminal,
    removeTerminal,
    reorderTerminals,
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
      displayOrder: response.displayOrder ?? response.label.index,
      status: 'active',
      createdAt: Date.now(),
    });
    setActiveTerminal(response.terminalId);
    await transport.invoke<UiState>('saveUiState', {
      activeTerminalId: response.terminalId,
    });
    return response;
  }, [addTerminal, setActiveTerminal]);

  const closeTerminal = useCallback(async (terminalId: string): Promise<void> => {
    const isActiveTerminal = useTerminalStore.getState().activeTerminalId === terminalId;
    destroyTerminalInstance(terminalId);
    await transport.invoke<void>('closeTerminal', { terminalId });
    removeTerminal(terminalId);

    if (isActiveTerminal) {
      await transport.invoke<UiState>('saveUiState', {
        activeTerminalId: null,
      });
    }
  }, [removeTerminal]);

  const switchTerminal = useCallback((terminalId: string): void => {
    setActiveTerminal(terminalId);
    void transport.invoke<UiState>('saveUiState', {
      activeTerminalId: terminalId,
    });
  }, [setActiveTerminal]);

  const reorderTerminalTabs = useCallback(async (request: ReorderTerminalsRequest): Promise<void> => {
    reorderTerminals(request.workspaceId, request.orderedTerminalIds);

    try {
      await transport.invoke<void>('reorderTerminals', request);
    } catch (error) {
      const response = await transport.invoke<ListTerminalsResponse>('listTerminals');
      setTerminals(response.terminals);
      throw error;
    }
  }, [reorderTerminals, setTerminals]);

  const loadTerminals = useCallback(async (): Promise<void> => {
    const response = await transport.invoke<ListTerminalsResponse>('listTerminals');
    setTerminals(response.terminals);

    const currentActiveTerminalId = useTerminalStore.getState().activeTerminalId;
    if (
      currentActiveTerminalId
      && response.terminals.some((terminal) => terminal.terminalId === currentActiveTerminalId)
    ) {
      return;
    }

    const uiState = await transport.invoke<UiState>('getUiState');
    const restoredTerminalId = response.terminals.find(
      (terminal) => terminal.terminalId === uiState.activeTerminalId,
    )?.terminalId ?? null;

    setActiveTerminal(restoredTerminalId);

    if (restoredTerminalId === null && uiState.activeTerminalId !== null) {
      await transport.invoke<UiState>('saveUiState', {
        activeTerminalId: null,
      });
    }
  }, [setActiveTerminal, setTerminals]);

  return {
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    reorderTerminalTabs,
    switchTerminal,
    loadTerminals,
    getOrderedTerminals,
    getTerminalsByWorkspace,
  };
};
