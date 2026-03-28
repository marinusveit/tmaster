import { useEffect } from 'react';
import type { TerminalSessionInfo } from '@shared/types/terminal';
import type { Workspace } from '@shared/types/workspace';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useQuickSwitcherStore } from '@renderer/stores/quickSwitcherStore';
import { isQuickSwitcherShortcut } from '@renderer/utils/quickSwitcher';

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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Mod+K → Quick-Switcher öffnen (Cmd auf macOS, Ctrl als Fallback).
      if (isQuickSwitcherShortcut(e)) {
        e.preventDefault();
        useQuickSwitcherStore.getState().open();
        return;
      }

      const quickSwitcherState = useQuickSwitcherStore.getState();
      if (quickSwitcherState.isOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          quickSwitcherState.close();
        }
        return;
      }

      // Ctrl+F → Suche im aktiven Terminal öffnen
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onOpenSearch();
        return;
      }

      // Escape → Terminalsuche schliessen
      if (e.key === 'Escape' && isSearchOpen) {
        e.preventDefault();
        onCloseSearch();
        return;
      }

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

      // Ctrl+Shift+S → Terminal-Output als Datei speichern
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        onSaveTerminalOutput();
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
