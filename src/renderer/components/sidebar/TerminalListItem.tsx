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
  const dotClass = STATUS_DOTS[terminal.status] ?? 'status-dot--idle';
  const borderClass = STATUS_BORDERS[terminal.status] ?? '';
  const statusLabel = STATUS_LABELS[terminal.status] ?? terminal.status;
  const terminalName = `${terminal.label.prefix}${terminal.label.index}`;

  return (
    <button
      className={`terminal-list-item ${borderClass} ${isActive ? 'terminal-list-item--active' : ''}`}
      onClick={onSelect}
      type="button"
      aria-label={`${terminalName} — ${statusLabel}`}
    >
      <span className={`status-dot ${dotClass}`} role="img" aria-label={statusLabel} />
      <span className="terminal-list-item__label">
        {terminal.label.prefix}{terminal.label.index}
      </span>
    </button>
  );
};
