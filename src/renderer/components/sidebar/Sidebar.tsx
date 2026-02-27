import type { TerminalId, TerminalSessionInfo } from '@shared/types/terminal';
import { TerminalList } from './TerminalList';

interface SidebarProps {
  terminals: TerminalSessionInfo[];
  activeTerminalId: TerminalId | null;
  onSelectTerminal: (terminalId: TerminalId) => void;
}

export const Sidebar = ({ terminals, activeTerminalId, onSelectTerminal }: SidebarProps): JSX.Element => {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h1 className="sidebar__title">tmaster</h1>
      </div>
      <div className="sidebar__section">
        <h2 className="sidebar__section-title">Terminals</h2>
        <TerminalList
          terminals={terminals}
          activeTerminalId={activeTerminalId}
          onSelect={onSelectTerminal}
        />
      </div>
      <div className="sidebar__section sidebar__section--assistant">
        <h2 className="sidebar__section-title">Assistant</h2>
        <div className="sidebar__placeholder">Phase 3</div>
      </div>
    </aside>
  );
};
