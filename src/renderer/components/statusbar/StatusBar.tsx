import type { TerminalSessionInfo } from '@shared/types/terminal';
import type { SplitMode } from '@renderer/stores/terminalStore';

interface StatusBarProps {
  terminals: TerminalSessionInfo[];
  workspaceName: string;
  splitMode: SplitMode;
  onCycleSplitMode: () => void;
}

const SPLIT_MODE_SYMBOLS: Record<SplitMode, string> = {
  single: '[1]',
  horizontal: '[||]',
  vertical: '[=]',
  grid: '[#]',
};

const SPLIT_MODE_LABELS: Record<SplitMode, string> = {
  single: 'Single',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  grid: 'Grid',
};

export const StatusBar = ({
  terminals,
  workspaceName,
  splitMode,
  onCycleSplitMode,
}: StatusBarProps): JSX.Element => {
  const waiting = terminals.filter((t) => t.isWaiting).length;
  const active = terminals.filter((t) => t.status === 'active' && !t.isWaiting).length;
  const idle = terminals.filter((t) => t.status === 'idle' && !t.isWaiting).length;
  const exited = terminals.filter((t) => t.status === 'exited').length;
  const hasTerminals = active > 0 || waiting > 0 || idle > 0 || exited > 0;

  return (
    <footer className="status-bar">
      {hasTerminals ? (
        <>
          {active > 0 && (
            <span className="status-bar__badge status-bar__badge--active">
              <span className="status-dot status-dot--active" /> {active} active
            </span>
          )}
          {waiting > 0 && (
            <span className="status-bar__badge status-bar__badge--idle">
              <span className="status-dot status-dot--waiting" /> {waiting} waiting
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
      <button
        className="status-bar__split-toggle"
        onClick={onCycleSplitMode}
        type="button"
        title={`Split Mode: ${SPLIT_MODE_LABELS[splitMode]}`}
      >
        {SPLIT_MODE_SYMBOLS[splitMode]} Split
      </button>
      <span className="status-bar__workspace">{workspaceName}</span>
    </footer>
  );
};
