import { useEffect } from 'react';
import { findMatchingKeybindingAction } from '../../common/keybindings';
import type { TerminalSessionInfo } from '@shared/types/terminal';
import type { Workspace } from '@shared/types/workspace';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useKeybindingStore } from '@renderer/stores/keybindingStore';
import { useQuickSwitcherStore } from '@renderer/stores/quickSwitcherStore';

interface KeyboardShortcutHandlers {
  onCreateTerminal: () => void;
  onCloseTerminal: () => void;
  onSaveTerminalOutput: () => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onSwitchTerminal: (terminalId: string) => void;
  onNextWorkspace: () => void;
  onToggleSplit: () => void;
  isSearchOpen: boolean;
  terminals: TerminalSessionInfo[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
}

export const useKeyboardShortcuts = ({
  onCreateTerminal,
  onCloseTerminal,
  onSaveTerminalOutput,
  onOpenSearch,
  onCloseSearch,
  onSwitchTerminal,
  onNextWorkspace,
  onToggleSplit,
  isSearchOpen,
  terminals,
  workspaces,
  activeWorkspaceId,
}: KeyboardShortcutHandlers): void => {
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const loadKeybindings = useKeybindingStore((state) => state.loadKeybindings);

  useEffect(() => {
    void loadKeybindings();
  }, [loadKeybindings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const quickSwitcherState = useQuickSwitcherStore.getState();
      if (quickSwitcherState.isOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          quickSwitcherState.close();
        }
        return;
      }

      const matchingAction = findMatchingKeybindingAction(e, keybindings);
      if (matchingAction === 'quickSwitcher') {
        e.preventDefault();
        quickSwitcherState.open();
        return;
      }

      // Escape → Terminalsuche schliessen
      if (e.key === 'Escape' && isSearchOpen) {
        e.preventDefault();
        onCloseSearch();
        return;
      }

      switch (matchingAction) {
        case 'openSearch':
          e.preventDefault();
          onOpenSearch();
          return;
        case 'createTerminal':
          e.preventDefault();
          onCreateTerminal();
          return;
        case 'closeTerminal':
          e.preventDefault();
          onCloseTerminal();
          return;
        case 'saveTerminalOutput':
          e.preventDefault();
          onSaveTerminalOutput();
          return;
        case 'nextWorkspace':
          e.preventDefault();
          onNextWorkspace();
          return;
        case 'toggleSplit':
          e.preventDefault();
          onToggleSplit();
          return;
        case 'toggleAssistant':
          e.preventDefault();
          useAssistantStore.getState().toggleExpanded();
          return;
        default:
          break;
      }

      // Escape → Assistant schliessen
      if (e.key === 'Escape') {
        const assistantState = useAssistantStore.getState();
        if (assistantState.isExpanded) {
          e.preventDefault();
          assistantState.setExpanded(false);
          return;
        }
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
  }, [
    activeWorkspaceId,
    keybindings,
    isSearchOpen,
    onCloseSearch,
    onCloseTerminal,
    onCreateTerminal,
    onNextWorkspace,
    onOpenSearch,
    onSaveTerminalOutput,
    onSwitchTerminal,
    onToggleSplit,
    terminals,
    workspaces,
  ]);
};
