import { useEffect, useCallback, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { TerminalSessionInfo } from '@shared/types/terminal';
import { useTerminals } from '@renderer/hooks/useTerminals';
import { useWorkspaces } from '@renderer/hooks/useWorkspaces';
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts';
import { TerminalView } from '@renderer/components/terminal/TerminalView';
import { TerminalTabs } from '@renderer/components/terminal/TerminalTabs';
import { SplitResizer } from '@renderer/components/terminal/SplitResizer';
import { Sidebar } from '@renderer/components/sidebar/Sidebar';
import { AssistantPanel } from '@renderer/components/sidebar/AssistantPanel';
import { WorkspaceTabs } from '@renderer/components/workspace/WorkspaceTabs';
import { StatusBar } from '@renderer/components/statusbar/StatusBar';
import { QuickSwitcher } from '@renderer/components/common/QuickSwitcher';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useAssistant } from '@renderer/hooks/useAssistant';
import type { SplitMode } from '@renderer/stores/terminalStore';

export const App = (): JSX.Element => {
  const {
    activeTerminalId,
    createTerminal,
    closeTerminal,
    switchTerminal,
    loadTerminals,
    getOrderedTerminals,
    getTerminalsByWorkspace,
  } = useTerminals();

  const {
    activeWorkspaceId,
    createWorkspace,
    switchWorkspace,
    getOrderedWorkspaces,
  } = useWorkspaces();

  const orderedWorkspaces = getOrderedWorkspaces();
  const activeWorkspace = orderedWorkspaces.find((ws) => ws.id === activeWorkspaceId);
  const rawWorkspaceTerminals = activeWorkspaceId
    ? getTerminalsByWorkspace(activeWorkspaceId)
    : getOrderedTerminals();
  const rawAllTerminals = getOrderedTerminals();

  // Stabile Referenzen: Nur neue Arrays liefern wenn sich Inhalt ändert
  const prevWorkspaceTerminalsRef = useRef(rawWorkspaceTerminals);
  const workspaceTerminals = useMemo(() => {
    const prev = prevWorkspaceTerminalsRef.current;
    if (
      prev.length === rawWorkspaceTerminals.length
      && prev.every((t, i) => t.terminalId === rawWorkspaceTerminals[i]?.terminalId && t.status === rawWorkspaceTerminals[i]?.status)
    ) {
      return prev;
    }
    prevWorkspaceTerminalsRef.current = rawWorkspaceTerminals;
    return rawWorkspaceTerminals;
  }, [rawWorkspaceTerminals]);

  const prevAllTerminalsRef = useRef(rawAllTerminals);
  const allTerminals = useMemo(() => {
    const prev = prevAllTerminalsRef.current;
    if (
      prev.length === rawAllTerminals.length
      && prev.every((t, i) => t.terminalId === rawAllTerminals[i]?.terminalId && t.status === rawAllTerminals[i]?.status)
    ) {
      return prev;
    }
    prevAllTerminalsRef.current = rawAllTerminals;
    return rawAllTerminals;
  }, [rawAllTerminals]);
  const splitMode = useTerminalStore((s) => s.splitMode);
  const splitRatio = useTerminalStore((s) => s.splitRatio);
  const cycleSplitMode = useTerminalStore((s) => s.cycleSplitMode);
  const setSplitRatio = useTerminalStore((s) => s.setSplitRatio);
  const isAssistantExpanded = useAssistantStore((s) => s.isExpanded);
  const toggleAssistant = useAssistantStore((s) => s.toggleExpanded);
  const addAssistantMessage = useAssistantStore((s) => s.addMessage);
  useAssistant();

  const visibleTerminals: TerminalSessionInfo[] = useMemo(() => {
    const slotCounts: Record<SplitMode, number> = {
      single: 1,
      horizontal: 2,
      vertical: 2,
      grid: 4,
    };
    const slots = slotCounts[splitMode];

    // Terminals in natürlicher Reihenfolge belassen — kein Umsortieren
    return workspaceTerminals.slice(0, slots);
  }, [splitMode, workspaceTerminals]);

  const shouldShowResizer = (splitMode === 'horizontal' || splitMode === 'vertical') && visibleTerminals.length > 1;
  const resizerDirection = splitMode === 'horizontal' ? 'horizontal' : 'vertical';
  const viewMode: SplitMode = shouldShowResizer
    ? splitMode
    : (splitMode === 'horizontal' || splitMode === 'vertical' ? 'single' : splitMode);

  const splitViewStyle = useMemo<CSSProperties | undefined>(() => {
    if (!shouldShowResizer) {
      return undefined;
    }

    if (splitMode === 'horizontal') {
      return {
        gridTemplateColumns: `minmax(0, calc((100% - 8px) * ${splitRatio})) 4px minmax(0, calc((100% - 8px) * ${1 - splitRatio}))`,
        gridTemplateRows: '1fr',
      };
    }

    return {
      gridTemplateColumns: '1fr',
      gridTemplateRows: `minmax(0, calc((100% - 8px) * ${splitRatio})) 4px minmax(0, calc((100% - 8px) * ${1 - splitRatio}))`,
    };
  }, [shouldShowResizer, splitMode, splitRatio]);

  const renderTerminalView = useCallback((terminal: TerminalSessionInfo) => {
    const isActive = terminal.terminalId === activeTerminalId;
    return (
      <div
        key={terminal.terminalId}
        className={`terminal-area__view-wrapper${isActive ? ' terminal-area__view-wrapper--active' : ''}`}
        onMouseDown={() => switchTerminal(terminal.terminalId)}
      >
        <TerminalView terminalId={terminal.terminalId} />
      </div>
    );
  }, [activeTerminalId, switchTerminal]);

  const reportAsyncError = useCallback((action: string, error: unknown): void => {
    const reason = error instanceof Error ? error.message : 'Unbekannter Fehler';
    addAssistantMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Fehler bei "${action}": ${reason}`,
      timestamp: Date.now(),
    });
  }, [addAssistantMessage]);

  const runAsync = useCallback((action: string, operation: () => Promise<void>): void => {
    void operation().catch((error: unknown) => {
      reportAsyncError(action, error);
    });
  }, [reportAsyncError]);

  // Terminals laden wenn Workspace verfügbar
  useEffect(() => {
    if (activeWorkspaceId) {
      runAsync('Terminals laden', async () => {
        await loadTerminals();
      });
    }
  }, [activeWorkspaceId, loadTerminals, runAsync]);

  // Erstes Terminal erstellen wenn Workspace da aber keine Terminals
  useEffect(() => {
    if (activeWorkspaceId && workspaceTerminals.length === 0 && allTerminals.length === 0) {
      runAsync('Erstes Terminal erstellen', async () => {
        await createTerminal({ workspaceId: activeWorkspaceId });
      });
    }
  }, [activeWorkspaceId, workspaceTerminals.length, allTerminals.length, createTerminal, runAsync]);

  // Sicherstellen, dass immer ein Terminal im aktiven Workspace ausgewählt ist.
  useEffect(() => {
    if (!activeTerminalId && workspaceTerminals.length > 0) {
      const firstTerminal = workspaceTerminals[0];
      if (firstTerminal) {
        switchTerminal(firstTerminal.terminalId);
      }
      return;
    }

    if (activeTerminalId && !workspaceTerminals.some((terminal) => terminal.terminalId === activeTerminalId)) {
      const firstTerminal = workspaceTerminals[0];
      if (firstTerminal) {
        switchTerminal(firstTerminal.terminalId);
      }
    }
  }, [activeTerminalId, workspaceTerminals, switchTerminal]);

  const handleCreateTerminal = useCallback(() => {
    if (activeWorkspaceId) {
      runAsync('Terminal erstellen', async () => {
        await createTerminal({ workspaceId: activeWorkspaceId });
      });
    }
  }, [activeWorkspaceId, createTerminal, runAsync]);

  const handleCloseTerminal = useCallback((terminalId: string) => {
    runAsync('Terminal schließen', async () => {
      await closeTerminal(terminalId);
    });
  }, [closeTerminal, runAsync]);

  const handleCreateWorkspace = useCallback((name: string, path: string) => {
    runAsync('Workspace erstellen', async () => {
      await createWorkspace({ name, path });
    });
  }, [createWorkspace, runAsync]);

  const handleSwitchWorkspace = useCallback((workspaceId: string) => {
    runAsync('Workspace wechseln', async () => {
      await switchWorkspace(workspaceId);
    });
  }, [switchWorkspace, runAsync]);

  const handleCloseActiveTerminal = useCallback(() => {
    if (activeTerminalId) {
      runAsync('Aktives Terminal schließen', async () => {
        await closeTerminal(activeTerminalId);
      });
    }
  }, [activeTerminalId, closeTerminal, runAsync]);

  const handleNextWorkspace = useCallback(() => {
    if (orderedWorkspaces.length <= 1) {
      return;
    }
    const currentIndex = orderedWorkspaces.findIndex((ws) => ws.id === activeWorkspaceId);
    const nextIndex = (currentIndex + 1) % orderedWorkspaces.length;
    const next = orderedWorkspaces[nextIndex];
    if (next) {
      runAsync('Nächsten Workspace wählen', async () => {
        await switchWorkspace(next.id);
      });
    }
  }, [orderedWorkspaces, activeWorkspaceId, switchWorkspace, runAsync]);

  const handleQuickSwitcherSelect = useCallback((terminalId: string) => {
    const selectedTerminal = allTerminals.find((terminal) => terminal.terminalId === terminalId);
    if (!selectedTerminal) {
      return;
    }

    if (selectedTerminal.workspaceId !== activeWorkspaceId) {
      runAsync('Terminal über Workspace-Wechsel aktivieren', async () => {
        await switchWorkspace(selectedTerminal.workspaceId);
        switchTerminal(terminalId);
      });
      return;
    }

    switchTerminal(terminalId);
  }, [allTerminals, activeWorkspaceId, switchWorkspace, switchTerminal, runAsync]);

  useKeyboardShortcuts({
    onCreateTerminal: handleCreateTerminal,
    onCloseTerminal: handleCloseActiveTerminal,
    onSwitchTerminal: switchTerminal,
    onNextWorkspace: handleNextWorkspace,
    onToggleSplit: cycleSplitMode,
    terminals: workspaceTerminals,
    workspaces: orderedWorkspaces,
    activeWorkspaceId,
  });

  return (
    <div className="app-shell">
      <WorkspaceTabs
        workspaces={orderedWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelect={handleSwitchWorkspace}
        onCreate={handleCreateWorkspace}
      />
      <div className={`app-shell__body${isAssistantExpanded ? ' app-shell__body--assistant-open' : ''}`}>
        <Sidebar
          terminals={workspaceTerminals}
          activeTerminalId={activeTerminalId}
          onSelectTerminal={switchTerminal}
        />
        <AssistantPanel isExpanded={isAssistantExpanded} onToggle={toggleAssistant} />
        <div className="terminal-area">
          <TerminalTabs
            terminals={workspaceTerminals}
            activeTerminalId={activeTerminalId}
            onSelect={switchTerminal}
            onClose={handleCloseTerminal}
            onCreate={handleCreateTerminal}
          />
          <div
            className={`terminal-area__views terminal-area__views--${viewMode}`}
            style={splitViewStyle}
          >
            {shouldShowResizer ? (
              <>
                {visibleTerminals[0] ? renderTerminalView(visibleTerminals[0]) : null}
                <SplitResizer direction={resizerDirection} onResize={setSplitRatio} />
                {visibleTerminals[1] ? renderTerminalView(visibleTerminals[1]) : null}
              </>
            ) : (
              visibleTerminals.map((terminal) => renderTerminalView(terminal))
            )}
            {workspaceTerminals.length === 0 && (
              <div className="terminal-area__empty">
                <div className="terminal-area__empty-icon">&gt;_</div>
                <span className="terminal-area__empty-message">
                  {activeWorkspace?.name ?? 'Workspace'} ist bereit
                </span>
                <button
                  className="terminal-area__empty-btn"
                  onClick={handleCreateTerminal}
                  type="button"
                >
                  Neues Terminal erstellen
                </button>
                <span className="terminal-area__empty-hint">
                  <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <StatusBar
        terminals={workspaceTerminals}
        workspaceName={activeWorkspace?.name ?? 'Kein Workspace'}
        splitMode={splitMode}
        onCycleSplitMode={cycleSplitMode}
      />
      <QuickSwitcher
        terminals={allTerminals}
        workspaces={orderedWorkspaces}
        activeTerminalId={activeTerminalId}
        onSelectTerminal={handleQuickSwitcherSelect}
      />
    </div>
  );
};
