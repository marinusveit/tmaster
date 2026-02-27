import type { TerminalLabel } from '@shared/types/terminal';

interface TerminalTabProps {
  label: TerminalLabel;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export const TerminalTab = ({ label, isActive, onSelect, onClose }: TerminalTabProps): JSX.Element => {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <button
      className={`terminal-tab ${isActive ? 'terminal-tab--active' : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className="terminal-tab__label">
        {label.prefix}{label.index}
      </span>
      <span
        className="terminal-tab__close"
        onClick={handleClose}
        role="button"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleClose(e as unknown as React.MouseEvent);
          }
        }}
      >
        &times;
      </span>
    </button>
  );
};
