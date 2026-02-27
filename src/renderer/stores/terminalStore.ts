import { create } from 'zustand';
import type { TerminalId, TerminalSessionInfo, TerminalStatus } from '@shared/types/terminal';
import type { WorkspaceId } from '@shared/types/workspace';

interface TerminalStoreState {
  terminals: Map<TerminalId, TerminalSessionInfo>;
  activeTerminalId: TerminalId | null;
}

interface TerminalStoreActions {
  addTerminal: (terminal: TerminalSessionInfo) => void;
  removeTerminal: (terminalId: TerminalId) => void;
  setActiveTerminal: (terminalId: TerminalId | null) => void;
  updateStatus: (terminalId: TerminalId, status: TerminalStatus) => void;
  getOrderedTerminals: () => TerminalSessionInfo[];
  getTerminalsByWorkspace: (workspaceId: WorkspaceId) => TerminalSessionInfo[];
  setTerminals: (terminals: TerminalSessionInfo[]) => void;
}

export type TerminalStore = TerminalStoreState & TerminalStoreActions;

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: new Map(),
  activeTerminalId: null,

  addTerminal: (terminal) => {
    set((state) => {
      const next = new Map(state.terminals);
      next.set(terminal.terminalId, terminal);
      return { terminals: next };
    });
  },

  removeTerminal: (terminalId) => {
    set((state) => {
      const next = new Map(state.terminals);
      next.delete(terminalId);
      const isActive = state.activeTerminalId === terminalId;
      return {
        terminals: next,
        activeTerminalId: isActive ? null : state.activeTerminalId,
      };
    });
  },

  setActiveTerminal: (terminalId) => {
    set({ activeTerminalId: terminalId });
  },

  updateStatus: (terminalId, status) => {
    set((state) => {
      const existing = state.terminals.get(terminalId);
      if (!existing) {
        return state;
      }

      const next = new Map(state.terminals);
      next.set(terminalId, { ...existing, status });
      return { terminals: next };
    });
  },

  getOrderedTerminals: () => {
    const { terminals } = get();
    return [...terminals.values()].sort((a, b) => a.label.index - b.label.index);
  },

  getTerminalsByWorkspace: (workspaceId) => {
    const { terminals } = get();
    return [...terminals.values()]
      .filter((t) => t.workspaceId === workspaceId)
      .sort((a, b) => a.label.index - b.label.index);
  },

  setTerminals: (terminals) => {
    const map = new Map<TerminalId, TerminalSessionInfo>();
    for (const t of terminals) {
      map.set(t.terminalId, t);
    }
    set({ terminals: map });
  },
}));
