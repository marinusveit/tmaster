import type { TerminalSessionInfo } from '@shared/types/terminal';

interface StatusBarProps {
  terminals: TerminalSessionInfo[];
  workspaceName: string;
}

export const StatusBar = ({ terminals, workspaceName }: StatusBarProps): JSX.Element => {
  const active = terminals.filter((t) => t.status === 'active').length;
  const idle = terminals.filter((t) => t.status === 'idle').length;
  const exited = terminals.filter((t) => t.status === 'exited').length;

  return (
    <footer className="status-bar">
      <span className="status-bar__item">
        <span className="status-dot status-dot--active" /> {active} active
      </span>
      <span className="status-bar__separator">|</span>
      <span className="status-bar__item">
        <span className="status-dot status-dot--idle" /> {idle} idle
      </span>
      <span className="status-bar__separator">|</span>
      <span className="status-bar__item">
        <span className="status-dot status-dot--exited" /> {exited} exited
      </span>
      <span className="status-bar__separator">|</span>
      <span className="status-bar__item">
        Workspace: {workspaceName}
      </span>
    </footer>
  );
};
