import { useEffect } from 'react';
import type { TerminalSessionInfo } from '@shared/types/terminal';
import type { Workspace } from '@shared/types/workspace';
import { useAssistantStore } from '@renderer/stores/assistantStore';

interface KeyboardShortcutHandlers {
  onCreateTerminal: () => void;
  onCloseTerminal: () => void;
  onSwitchTerminal: (terminalId: string) => void;
  onNextWorkspace: () => void;
  onToggleSplit: () => void;
  terminals: TerminalSessionInfo[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
}

export const useKeyboardShortcuts = ({
  onCreateTerminal,
  onCloseTerminal,
  onSwitchTerminal,
  onNextWorkspace,
  onToggleSplit,
  terminals,
  workspaces,
  activeWorkspaceId,
}: KeyboardShortcutHandlers): void => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+T → Neues Terminal
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        onCreateTerminal();
        return;
      }

      // Ctrl+Shift+W → Aktives Terminal schließen
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        onCloseTerminal();
        return;
      }

      // Ctrl+Tab → Nächster Workspace
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        onNextWorkspace();
        return;
      }

      // Ctrl+\ → Split-Mode durchschalten
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        onToggleSplit();
        return;
      }

      // Ctrl+. → Assistant Panel togglen
      if (e.ctrlKey && e.key === '.') {
        e.preventDefault();
        useAssistantStore.getState().toggleExpanded();
        return;
      }

      // Ctrl+1 bis Ctrl+9 → Terminal nach Position
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        const terminal = terminals[index];
        if (terminal) {
          onSwitchTerminal(terminal.terminalId);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCreateTerminal, onCloseTerminal, onSwitchTerminal, onNextWorkspace, onToggleSplit, terminals, workspaces, activeWorkspaceId]);
};
