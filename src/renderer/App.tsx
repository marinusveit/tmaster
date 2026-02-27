import { useEffect, useCallback } from 'react';
import { useTerminals } from '@renderer/hooks/useTerminals';
import { useWorkspaces } from '@renderer/hooks/useWorkspaces';
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts';
import { TerminalView } from '@renderer/components/terminal/TerminalView';
import { TerminalTabs } from '@renderer/components/terminal/TerminalTabs';
import { Sidebar } from '@renderer/components/sidebar/Sidebar';
import { WorkspaceTabs } from '@renderer/components/workspace/WorkspaceTabs';
import { StatusBar } from '@renderer/components/statusbar/StatusBar';

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
          <div className="terminal-area__views">
            {workspaceTerminals.map((terminal) => (
              <div
                key={terminal.terminalId}
                className="terminal-area__view-wrapper"
                style={{ display: terminal.terminalId === activeTerminalId ? 'block' : 'none' }}
              >
                <TerminalView terminalId={terminal.terminalId} />
              </div>
            ))}
            {workspaceTerminals.length === 0 && (
              <div className="terminal-area__empty">
                <button
                  className="terminal-area__empty-btn"
                  onClick={handleCreateTerminal}
                  type="button"
                >
                  Neues Terminal erstellen
                </button>
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
