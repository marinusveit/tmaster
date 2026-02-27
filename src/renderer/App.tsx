import { useEffect, useCallback, useMemo } from 'react';
import { useTerminals } from '@renderer/hooks/useTerminals';
import { useWorkspaces } from '@renderer/hooks/useWorkspaces';
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts';
import { TerminalView } from '@renderer/components/terminal/TerminalView';
import { TerminalTabs } from '@renderer/components/terminal/TerminalTabs';
import { Sidebar } from '@renderer/components/sidebar/Sidebar';
import { WorkspaceTabs } from '@renderer/components/workspace/WorkspaceTabs';
import { StatusBar } from '@renderer/components/statusbar/StatusBar';
import { useTerminalStore } from '@renderer/stores/terminalStore';
import type { SplitMode } from '@renderer/stores/terminalStore';
import type { TerminalSessionInfo } from '@shared/types/terminal';

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
  const workspaceTerminals = activeWorkspaceId
    ? getTerminalsByWorkspace(activeWorkspaceId)
    : getOrderedTerminals();
  const allTerminals = getOrderedTerminals();
  const splitMode = useTerminalStore((s) => s.splitMode);
  const cycleSplitMode = useTerminalStore((s) => s.cycleSplitMode);
  const activeWorkspaceTerminal = workspaceTerminals.find((terminal) => terminal.terminalId === activeTerminalId) ?? null;

  const visibleTerminals: TerminalSessionInfo[] = useMemo(() => {
    const slotCounts: Record<SplitMode, number> = {
      single: 1,
      horizontal: 2,
      vertical: 2,
      grid: 4,
    };
    const slots = slotCounts[splitMode];

    // Aktives Terminal zuerst, dann weitere aus dem Workspace
    const result: TerminalSessionInfo[] = [];
    if (activeWorkspaceTerminal) {
      result.push(activeWorkspaceTerminal);
    }
    for (const t of workspaceTerminals) {
      if (result.length >= slots) {
        break;
      }
      if (!result.some((r) => r.terminalId === t.terminalId)) {
        result.push(t);
      }
    }
    return result;
  }, [splitMode, activeWorkspaceTerminal, workspaceTerminals]);

  // Terminals laden wenn Workspace verfügbar
  useEffect(() => {
    if (activeWorkspaceId) {
      void loadTerminals();
    }
  }, [activeWorkspaceId, loadTerminals]);

  // Erstes Terminal erstellen wenn Workspace da aber keine Terminals
  useEffect(() => {
    if (activeWorkspaceId && workspaceTerminals.length === 0 && allTerminals.length === 0) {
      void createTerminal({ workspaceId: activeWorkspaceId });
    }
  }, [activeWorkspaceId, workspaceTerminals.length, allTerminals.length, createTerminal]);

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
      void createTerminal({ workspaceId: activeWorkspaceId });
    }
  }, [activeWorkspaceId, createTerminal]);

  const handleCloseTerminal = useCallback((terminalId: string) => {
    void closeTerminal(terminalId);
  }, [closeTerminal]);

  const handleCreateWorkspace = useCallback((name: string, path: string) => {
    void createWorkspace({ name, path });
  }, [createWorkspace]);

  const handleSwitchWorkspace = useCallback((workspaceId: string) => {
    void switchWorkspace(workspaceId);
  }, [switchWorkspace]);

  const handleCloseActiveTerminal = useCallback(() => {
    if (activeTerminalId) {
      void closeTerminal(activeTerminalId);
    }
  }, [activeTerminalId, closeTerminal]);

  const handleNextWorkspace = useCallback(() => {
    if (orderedWorkspaces.length <= 1) {
      return;
    }
    const currentIndex = orderedWorkspaces.findIndex((ws) => ws.id === activeWorkspaceId);
    const nextIndex = (currentIndex + 1) % orderedWorkspaces.length;
    const next = orderedWorkspaces[nextIndex];
    if (next) {
      void switchWorkspace(next.id);
    }
  }, [orderedWorkspaces, activeWorkspaceId, switchWorkspace]);

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
      <div className="app-shell__body">
        <Sidebar
          terminals={workspaceTerminals}
          activeTerminalId={activeTerminalId}
          onSelectTerminal={switchTerminal}
        />
        <div className="terminal-area">
          <TerminalTabs
            terminals={workspaceTerminals}
            activeTerminalId={activeTerminalId}
            onSelect={switchTerminal}
            onClose={handleCloseTerminal}
            onCreate={handleCreateTerminal}
          />
          <div className={`terminal-area__views terminal-area__views--${splitMode}`}>
            {visibleTerminals.map((terminal) => (
              <div
                key={terminal.terminalId}
                className="terminal-area__view-wrapper"
              >
                <TerminalView terminalId={terminal.terminalId} />
              </div>
            ))}
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
      />
    </div>
  );
};
