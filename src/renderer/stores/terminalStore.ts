import { create } from 'zustand';
import {
  DEFAULT_TERMINAL_SCROLLBACK,
  TERMINAL_PROTECTION_THRESHOLD_BYTES_PER_SECOND,
  type TerminalId,
  type TerminalProtectionState,
  type TerminalSessionInfo,
  type TerminalStatus,
} from '@shared/types/terminal';
import type { WorkspaceId } from '@shared/types/workspace';
import {
  DEFAULT_SPLIT_MODE,
  DEFAULT_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
} from '@shared/constants/defaults';
import type { SplitMode } from '@shared/types/uiState';

export interface TerminalSearchState {
  isOpen: boolean;
  terminalId: TerminalId | null;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  resultIndex: number;
  resultCount: number;
}

const SPLIT_MODE_CYCLE: SplitMode[] = ['single', 'horizontal', 'vertical', 'grid'];
export type { SplitMode } from '@shared/types/uiState';

const createDefaultSearchState = (): TerminalSearchState => ({
  isOpen: false,
  terminalId: null,
  query: '',
  caseSensitive: false,
  regex: false,
  resultIndex: -1,
  resultCount: 0,
});

const createDefaultProtectionState = (): TerminalProtectionState => ({
  mode: 'normal',
  reason: 'none',
  outputBytesPerSecond: 0,
  bufferedBytes: 0,
  thresholdBytesPerSecond: TERMINAL_PROTECTION_THRESHOLD_BYTES_PER_SECOND,
  warning: null,
  updatedAt: 0,
});

const mergeTerminalWithEphemeralState = (
  incoming: TerminalSessionInfo,
  existing?: TerminalSessionInfo,
): TerminalSessionInfo => {
  return {
    ...incoming,
    scrollback: incoming.scrollback ?? existing?.scrollback ?? DEFAULT_TERMINAL_SCROLLBACK,
    protection: incoming.protection ?? existing?.protection ?? createDefaultProtectionState(),
    isWaiting: existing?.isWaiting ?? incoming.isWaiting,
    waitingContext: existing?.waitingContext ?? incoming.waitingContext,
    waitingSince: existing?.waitingSince ?? incoming.waitingSince,
  };
};

const compareTerminalDisplayOrder = (left: TerminalSessionInfo, right: TerminalSessionInfo): number => {
  const leftOrder = left.displayOrder ?? left.label.index;
  const rightOrder = right.displayOrder ?? right.label.index;
  return leftOrder - rightOrder || left.createdAt - right.createdAt || left.label.index - right.label.index;
};

interface TerminalStoreState {
  terminals: Map<TerminalId, TerminalSessionInfo>;
  activeTerminalId: TerminalId | null;
  splitMode: SplitMode;
  splitRatio: number;
  search: TerminalSearchState;
}

interface TerminalStoreActions {
  addTerminal: (terminal: TerminalSessionInfo) => void;
  removeTerminal: (terminalId: TerminalId) => void;
  reorderTerminals: (workspaceId: WorkspaceId, orderedTerminalIds: TerminalId[]) => void;
  setActiveTerminal: (terminalId: TerminalId | null) => void;
  updateStatus: (terminalId: TerminalId, status: TerminalStatus) => void;
  updateProtection: (terminalId: TerminalId, protection: TerminalProtectionState) => void;
  setWaitingState: (terminalId: TerminalId, context: string, timestamp: number) => void;
  clearWaitingState: (terminalId: TerminalId) => void;
  getOrderedTerminals: () => TerminalSessionInfo[];
  getTerminalsByWorkspace: (workspaceId: WorkspaceId) => TerminalSessionInfo[];
  setTerminals: (terminals: TerminalSessionInfo[]) => void;
  setSplitMode: (mode: SplitMode) => void;
  cycleSplitMode: () => void;
  setSplitRatio: (ratio: number) => void;
  resetSplitRatio: () => void;
  openSearch: (terminalId: TerminalId) => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  toggleSearchCaseSensitive: () => void;
  toggleSearchRegex: () => void;
  setSearchResults: (resultIndex: number, resultCount: number) => void;
}

export type TerminalStore = TerminalStoreState & TerminalStoreActions;

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: new Map(),
  activeTerminalId: null,
  splitMode: DEFAULT_SPLIT_MODE as SplitMode,
  splitRatio: DEFAULT_SPLIT_RATIO,
  search: createDefaultSearchState(),

  addTerminal: (terminal) => {
    set((state) => {
      const next = new Map(state.terminals);
      next.set(terminal.terminalId, mergeTerminalWithEphemeralState(terminal, state.terminals.get(terminal.terminalId)));
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
        search: state.search.terminalId === terminalId ? createDefaultSearchState() : state.search,
      };
    });
  },

  reorderTerminals: (workspaceId, orderedTerminalIds) => {
    set((state) => {
      const workspaceTerminals = [...state.terminals.values()].filter((terminal) => terminal.workspaceId === workspaceId);
      const orderedIdSet = new Set(orderedTerminalIds);
      if (
        workspaceTerminals.length !== orderedTerminalIds.length
        || workspaceTerminals.some((terminal) => !orderedIdSet.has(terminal.terminalId))
      ) {
        return state;
      }

      const next = new Map(state.terminals);
      orderedTerminalIds.forEach((terminalId, index) => {
        const terminal = next.get(terminalId);
        if (terminal) {
          next.set(terminalId, {
            ...terminal,
            displayOrder: index + 1,
          });
        }
      });

      return { terminals: next };
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
      next.set(terminalId, {
        ...existing,
        status,
        isWaiting: status === 'exited' ? false : existing.isWaiting,
        waitingContext: status === 'exited' ? undefined : existing.waitingContext,
        waitingSince: status === 'exited' ? undefined : existing.waitingSince,
      });
      return { terminals: next };
    });
  },

  updateProtection: (terminalId, protection) => {
    set((state) => {
      const existing = state.terminals.get(terminalId);
      if (!existing) {
        return state;
      }

      const next = new Map(state.terminals);
      next.set(terminalId, {
        ...existing,
        protection,
      });
      return { terminals: next };
    });
  },

  setWaitingState: (terminalId, context, timestamp) => {
    set((state) => {
      const existing = state.terminals.get(terminalId);
      if (!existing) {
        return state;
      }

      const next = new Map(state.terminals);
      next.set(terminalId, {
        ...existing,
        isWaiting: true,
        waitingContext: context,
        waitingSince: timestamp,
      });
      return { terminals: next };
    });
  },

  clearWaitingState: (terminalId) => {
    set((state) => {
      const existing = state.terminals.get(terminalId);
      if (!existing || !existing.isWaiting) {
        return state;
      }

      const next = new Map(state.terminals);
      next.set(terminalId, {
        ...existing,
        isWaiting: false,
        waitingContext: undefined,
        waitingSince: undefined,
      });
      return { terminals: next };
    });
  },

  getOrderedTerminals: () => {
    const { terminals } = get();
    return [...terminals.values()].sort(compareTerminalDisplayOrder);
  },

  getTerminalsByWorkspace: (workspaceId) => {
    const { terminals } = get();
    return [...terminals.values()]
      .filter((t) => t.workspaceId === workspaceId)
      .sort(compareTerminalDisplayOrder);
  },

  setTerminals: (terminals) => {
    const map = new Map<TerminalId, TerminalSessionInfo>();
    for (const t of terminals) {
      map.set(t.terminalId, mergeTerminalWithEphemeralState({
        ...t,
        scrollback: t.scrollback ?? DEFAULT_TERMINAL_SCROLLBACK,
      }, get().terminals.get(t.terminalId)));
    }
    set((state) => ({
      terminals: map,
      search: state.search.terminalId && !map.has(state.search.terminalId)
        ? createDefaultSearchState()
        : state.search,
    }));
  },

  setSplitMode: (mode) => {
    set({ splitMode: mode });
  },

  cycleSplitMode: () => {
    set((state) => {
      const currentIndex = SPLIT_MODE_CYCLE.indexOf(state.splitMode);
      const nextMode = SPLIT_MODE_CYCLE[(currentIndex + 1) % SPLIT_MODE_CYCLE.length] ?? 'single';
      return { splitMode: nextMode };
    });
  },

  setSplitRatio: (ratio) => {
    const clampedRatio = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
    set({ splitRatio: clampedRatio });
  },

  resetSplitRatio: () => {
    set({ splitRatio: DEFAULT_SPLIT_RATIO });
  },

  openSearch: (terminalId) => {
    set((state) => {
      const isSameTerminal = state.search.terminalId === terminalId;
      if (isSameTerminal) {
        return {
          search: {
            ...state.search,
            isOpen: true,
          },
        };
      }

      return {
        search: {
          ...createDefaultSearchState(),
          isOpen: true,
          terminalId,
        },
      };
    });
  },

  closeSearch: () => {
    set({ search: createDefaultSearchState() });
  },

  setSearchQuery: (query) => {
    set((state) => ({
      search: {
        ...state.search,
        query,
      },
    }));
  },

  toggleSearchCaseSensitive: () => {
    set((state) => ({
      search: {
        ...state.search,
        caseSensitive: !state.search.caseSensitive,
      },
    }));
  },

  toggleSearchRegex: () => {
    set((state) => ({
      search: {
        ...state.search,
        regex: !state.search.regex,
      },
    }));
  },

  setSearchResults: (resultIndex, resultCount) => {
    set((state) => ({
      search: {
        ...state.search,
        resultIndex,
        resultCount,
      },
    }));
  },
}));
