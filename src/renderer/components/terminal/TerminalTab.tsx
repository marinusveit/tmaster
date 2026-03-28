import type { TerminalLabel } from '@shared/types/terminal';

interface TerminalTabProps {
  label: TerminalLabel;
  hasProtectionWarning: boolean;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export const TerminalTab = ({
  label,
  hasProtectionWarning,
  isActive,
  onSelect,
  onClose,
}: TerminalTabProps): JSX.Element => {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const terminalName = `${label.prefix}${label.index}`;

  return (
    <button
      className={`terminal-tab ${isActive ? 'terminal-tab--active' : ''}`}
      onClick={onSelect}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={`Terminal ${terminalName}`}
    >
      <span className="terminal-tab__label">
        {label.prefix}{label.index}
      </span>
      {hasProtectionWarning ? (
        <span className="terminal-tab__badge" aria-hidden="true">
          SAFE
        </span>
      ) : null}
      <span
        className="terminal-tab__close"
        onClick={handleClose}
        role="button"
        tabIndex={-1}
        aria-label="Terminal schliessen"
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
