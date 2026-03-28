import type { SplitMode } from '@renderer/stores/terminalStore';
import type { TerminalId, TerminalSessionInfo } from '@shared/types/terminal';

const SLOT_COUNT_BY_SPLIT_MODE: Record<SplitMode, number> = {
  single: 1,
  horizontal: 2,
  vertical: 2,
  grid: 4,
};

export const getVisibleTerminals = (
  terminals: TerminalSessionInfo[],
  activeTerminalId: TerminalId | null,
  splitMode: SplitMode,
): TerminalSessionInfo[] => {
  const slots = SLOT_COUNT_BY_SPLIT_MODE[splitMode];
  if (terminals.length <= slots) {
    return terminals;
  }

  if (activeTerminalId === null) {
    return terminals.slice(0, slots);
  }

  const activeIndex = terminals.findIndex((terminal) => terminal.terminalId === activeTerminalId);
  if (activeIndex === -1) {
    return terminals.slice(0, slots);
  }

  const maxStartIndex = Math.max(0, terminals.length - slots);
  const startIndex = Math.min(activeIndex, maxStartIndex);
  return terminals.slice(startIndex, startIndex + slots);
};
