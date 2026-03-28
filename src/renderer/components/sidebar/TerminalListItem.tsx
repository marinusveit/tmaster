import type { TerminalSessionInfo } from '@shared/types/terminal';

interface TerminalListItemProps {
  terminal: TerminalSessionInfo;
  isActive: boolean;
  onSelect: () => void;
}

const STATUS_DOTS: Record<string, string> = {
  active: 'status-dot--active',
  idle: 'status-dot--idle',
  exited: 'status-dot--exited',
};

const STATUS_BORDERS: Record<string, string> = {
  active: 'terminal-list-item--status-active',
  idle: 'terminal-list-item--status-idle',
  exited: 'terminal-list-item--status-exited',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  idle: 'Inaktiv',
  exited: 'Beendet',
};

export const TerminalListItem = ({ terminal, isActive, onSelect }: TerminalListItemProps): JSX.Element => {
  const isWaiting = terminal.isWaiting === true;
  const dotClass = isWaiting ? 'status-dot--waiting' : (STATUS_DOTS[terminal.status] ?? 'status-dot--idle');
  const borderClass = isWaiting ? 'terminal-list-item--status-waiting terminal-list-item--waiting' : (STATUS_BORDERS[terminal.status] ?? '');
  const statusLabel = isWaiting ? 'Wartet auf Input' : (STATUS_LABELS[terminal.status] ?? terminal.status);
  const waitingContext = isWaiting
    ? (terminal.waitingContext?.trim() || 'Wartet auf Input')
    : null;
  const terminalName = `${terminal.label.prefix}${terminal.label.index}`;

  return (
    <button
      className={`terminal-list-item ${borderClass} ${isActive ? 'terminal-list-item--active' : ''}`}
      onClick={onSelect}
      type="button"
      aria-label={`${terminalName} — ${statusLabel}${waitingContext ? ` — ${waitingContext}` : ''}`}
    >
      <span className={`status-dot ${dotClass}`} role="img" aria-label={statusLabel} />
      <span className="terminal-list-item__body">
        <span className="terminal-list-item__row">
          <span className="terminal-list-item__label">
            {terminal.label.prefix}{terminal.label.index}
          </span>
          {isWaiting && <span className="terminal-list-item__badge">Input</span>}
        </span>
        {waitingContext && (
          <span className="terminal-list-item__context">{waitingContext}</span>
        )}
      </span>
    </button>
  );
};
