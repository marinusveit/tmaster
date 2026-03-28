import type { TerminalId } from '@shared/types/terminal';

export type DropPosition = 'before' | 'after';

export const getDropPosition = (clientX: number, bounds: Pick<DOMRect, 'left' | 'width'>): DropPosition => {
  return clientX - bounds.left < bounds.width / 2 ? 'before' : 'after';
};

export const reorderTerminalIds = (
  orderedTerminalIds: TerminalId[],
  draggedTerminalId: TerminalId,
  targetTerminalId: TerminalId,
  position: DropPosition,
): TerminalId[] => {
  if (draggedTerminalId === targetTerminalId) {
    return orderedTerminalIds;
  }

  const draggedIndex = orderedTerminalIds.indexOf(draggedTerminalId);
  const targetIndex = orderedTerminalIds.indexOf(targetTerminalId);
  if (draggedIndex === -1 || targetIndex === -1) {
    return orderedTerminalIds;
  }

  const nextOrder = [...orderedTerminalIds];
  nextOrder.splice(draggedIndex, 1);

  const adjustedTargetIndex = nextOrder.indexOf(targetTerminalId);
  const insertIndex = position === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1;
  nextOrder.splice(insertIndex, 0, draggedTerminalId);

  return nextOrder;
};
