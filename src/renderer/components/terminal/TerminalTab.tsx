import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import type { TerminalLabel } from '@shared/types/terminal';
import type { DropPosition } from './terminalTabDrag';

interface TerminalTabProps {
  label: TerminalLabel;
  isActive: boolean;
  isDragging: boolean;
  dropIndicator: DropPosition | null;
  onSelect: () => void;
  onClose: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
}

export const TerminalTab = ({
  label,
  isActive,
  isDragging,
  dropIndicator,
  onSelect,
  onClose,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: TerminalTabProps): JSX.Element => {
  const handleClose = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
    onClose();
  };

  const terminalName = `${label.prefix}${label.index}`;

  return (
    <button
      className={`terminal-tab ${isActive ? 'terminal-tab--active' : ''} ${isDragging ? 'terminal-tab--dragging' : ''} ${dropIndicator === 'before' ? 'terminal-tab--drop-before' : ''} ${dropIndicator === 'after' ? 'terminal-tab--drop-after' : ''}`}
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      draggable
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={`Terminal ${terminalName}`}
    >
      <span className="terminal-tab__label">
        {label.prefix}{label.index}
      </span>
      <span
        className="terminal-tab__close"
        onClick={(event) => handleClose(event)}
        role="button"
        tabIndex={-1}
        aria-label="Terminal schliessen"
        draggable={false}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleClose(e);
          }
        }}
      >
        &times;
      </span>
    </button>
  );
};
