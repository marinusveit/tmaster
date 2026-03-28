import { create } from 'zustand';

interface QuickSwitcherState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
}

interface QuickSwitcherActions {
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (selectedIndex: number) => void;
  moveUp: () => void;
  moveDown: () => void;
  resetSelection: () => void;
}

export type QuickSwitcherStore = QuickSwitcherState & QuickSwitcherActions;

const INITIAL_STATE: QuickSwitcherState = {
  isOpen: false,
  query: '',
  selectedIndex: 0,
};

export const useQuickSwitcherStore = create<QuickSwitcherStore>((set) => ({
  ...INITIAL_STATE,

  open: () => {
    set({ isOpen: true, selectedIndex: 0 });
  },

  close: () => {
    set({ ...INITIAL_STATE });
  },

  setQuery: (query) => {
    set({ query, selectedIndex: 0 });
  },

  setSelectedIndex: (selectedIndex) => {
    set({ selectedIndex });
  },

  moveUp: () => {
    set((state) => ({
      selectedIndex: Math.max(0, state.selectedIndex - 1),
    }));
  },

  moveDown: () => {
    set((state) => ({
      selectedIndex: state.selectedIndex + 1,
    }));
  },

  resetSelection: () => {
    set({ selectedIndex: 0 });
  },
}));
