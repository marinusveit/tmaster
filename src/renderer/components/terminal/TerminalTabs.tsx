import type { TerminalId, TerminalSessionInfo } from '@shared/types/terminal';
import { TerminalTab } from './TerminalTab';

interface TerminalTabsProps {
  terminals: TerminalSessionInfo[];
  activeTerminalId: TerminalId | null;
  onSelect: (terminalId: TerminalId) => void;
  onClose: (terminalId: TerminalId) => void;
  onCreate: () => void;
}

export const TerminalTabs = ({
  terminals,
  activeTerminalId,
  onSelect,
  onClose,
  onCreate,
}: TerminalTabsProps): JSX.Element => {
  return (
    <div className="terminal-tabs">
      <div className="terminal-tabs__list" role="tablist" aria-label="Terminal-Tabs">
        {terminals.map((terminal) => (
          <TerminalTab
            key={terminal.terminalId}
            label={terminal.label}
            hasProtectionWarning={terminal.protection?.isProtectionActive === true}
            isActive={terminal.terminalId === activeTerminalId}
            onSelect={() => onSelect(terminal.terminalId)}
            onClose={() => onClose(terminal.terminalId)}
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
