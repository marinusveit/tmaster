import type { TerminalId, TerminalSessionInfo } from '@shared/types/terminal';
import { TerminalListItem } from './TerminalListItem';

interface TerminalListProps {
  terminals: TerminalSessionInfo[];
  activeTerminalId: TerminalId | null;
  onSelect: (terminalId: TerminalId) => void;
}

export const TerminalList = ({ terminals, activeTerminalId, onSelect }: TerminalListProps): JSX.Element => {
  return (
    <div className="terminal-list">
      {terminals.map((terminal) => (
        <TerminalListItem
          key={terminal.terminalId}
          terminal={terminal}
          isActive={terminal.terminalId === activeTerminalId}
          onSelect={() => onSelect(terminal.terminalId)}
        />
      ))}
      {terminals.length === 0 && (
        <div className="terminal-list__empty">Keine Terminals</div>
      )}
    </div>
  );
};
