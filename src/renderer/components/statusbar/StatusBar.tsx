import type { TerminalSessionInfo } from '@shared/types/terminal';

interface StatusBarProps {
  terminals: TerminalSessionInfo[];
  workspaceName: string;
}

export const StatusBar = ({ terminals, workspaceName }: StatusBarProps): JSX.Element => {
  const active = terminals.filter((t) => t.status === 'active').length;
  const idle = terminals.filter((t) => t.status === 'idle').length;
  const exited = terminals.filter((t) => t.status === 'exited').length;
  const hasTerminals = active > 0 || idle > 0 || exited > 0;

  return (
    <footer className="status-bar">
      {hasTerminals ? (
        <>
          {active > 0 && (
            <span className="status-bar__badge status-bar__badge--active">
              <span className="status-dot status-dot--active" /> {active} active
            </span>
          )}
          {idle > 0 && (
            <span className="status-bar__badge status-bar__badge--idle">
              <span className="status-dot status-dot--idle" /> {idle} idle
            </span>
          )}
          {exited > 0 && (
            <span className="status-bar__badge status-bar__badge--exited">
              <span className="status-dot status-dot--exited" /> {exited} exited
            </span>
          )}
        </>
      ) : (
        <span className="status-bar__empty">Keine Terminals</span>
      )}
      <span className="status-bar__workspace">{workspaceName}</span>
    </footer>
  );
};
