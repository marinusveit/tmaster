import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { TerminalId, TerminalSessionInfo } from '@shared/types/terminal';
import { TerminalTab } from './TerminalTab';
import { getDropPosition, reorderTerminalIds, type DropPosition } from './terminalTabDrag';

interface TerminalTabsProps {
  terminals: TerminalSessionInfo[];
  activeTerminalId: TerminalId | null;
  onSelect: (terminalId: TerminalId) => void;
  onClose: (terminalId: TerminalId) => void;
  onReorder: (orderedTerminalIds: TerminalId[]) => void;
  onCreate: () => void;
}

interface DropIndicator {
  terminalId: TerminalId;
  position: DropPosition;
}

export const TerminalTabs = ({
  terminals,
  activeTerminalId,
  onSelect,
  onClose,
  onReorder,
  onCreate,
}: TerminalTabsProps): JSX.Element => {
  const [draggedTerminalId, setDraggedTerminalId] = useState<TerminalId | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const dragGhostRef = useRef<HTMLElement | null>(null);

  const cleanupDragState = useCallback(() => {
    setDraggedTerminalId(null);
    setDropIndicator(null);

    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (dragGhostRef.current) {
        dragGhostRef.current.remove();
        dragGhostRef.current = null;
      }
    };
  }, []);

  const handleDragStart = useCallback((terminalId: TerminalId, label: string, event: DragEvent<HTMLButtonElement>) => {
    setDraggedTerminalId(terminalId);
    setDropIndicator(null);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', terminalId);

      const ghost = document.createElement('div');
      ghost.className = 'terminal-tab terminal-tab--drag-ghost';
      ghost.textContent = label;
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
      dragGhostRef.current = ghost;
    }
  }, []);

  const handleDragOver = useCallback((terminalId: TerminalId, event: DragEvent<HTMLButtonElement>) => {
    if (!draggedTerminalId || draggedTerminalId === terminalId) {
      return;
    }

    event.preventDefault();
    const position = getDropPosition(event.clientX, event.currentTarget.getBoundingClientRect());
    setDropIndicator({ terminalId, position });

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }, [draggedTerminalId]);

  const handleDrop = useCallback((terminalId: TerminalId, event: DragEvent<HTMLButtonElement>) => {
    if (!draggedTerminalId || draggedTerminalId === terminalId) {
      cleanupDragState();
      return;
    }

    event.preventDefault();
    const position = getDropPosition(event.clientX, event.currentTarget.getBoundingClientRect());
    const nextOrder = reorderTerminalIds(
      terminals.map((terminal) => terminal.terminalId),
      draggedTerminalId,
      terminalId,
      position,
    );

    cleanupDragState();
    if (nextOrder.some((id, index) => id !== terminals[index]?.terminalId)) {
      onReorder(nextOrder);
    }
  }, [cleanupDragState, draggedTerminalId, onReorder, terminals]);

  return (
    <div className="terminal-tabs">
      <div className="terminal-tabs__list" role="tablist" aria-label="Terminal-Tabs">
        {terminals.map((terminal) => (
          <TerminalTab
            key={terminal.terminalId}
            label={terminal.label}
            isActive={terminal.terminalId === activeTerminalId}
            isDragging={terminal.terminalId === draggedTerminalId}
            dropIndicator={dropIndicator?.terminalId === terminal.terminalId ? dropIndicator.position : null}
            onSelect={() => onSelect(terminal.terminalId)}
            onClose={() => onClose(terminal.terminalId)}
            onDragStart={(event) => handleDragStart(terminal.terminalId, `${terminal.label.prefix}${terminal.label.index}`, event)}
            onDragEnd={cleanupDragState}
            onDragOver={(event) => handleDragOver(terminal.terminalId, event)}
            onDrop={(event) => handleDrop(terminal.terminalId, event)}
          />
        ))}
      </div>
      <button
        className="terminal-tabs__add"
        onClick={onCreate}
        type="button"
        title="Neues Terminal (Ctrl+Shift+T)"
        aria-label="Neues Terminal erstellen"
      >
        +
      </button>
    </div>
  );
};
