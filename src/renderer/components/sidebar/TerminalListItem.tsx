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

export const TerminalListItem = ({ terminal, isActive, onSelect }: TerminalListItemProps): JSX.Element => {
  const dotClass = STATUS_DOTS[terminal.status] ?? 'status-dot--idle';

  return (
    <button
      className={`terminal-list-item ${isActive ? 'terminal-list-item--active' : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`status-dot ${dotClass}`} />
      <span className="terminal-list-item__label">
        {terminal.label.prefix}{terminal.label.index}
      </span>
    </button>
  );
};
