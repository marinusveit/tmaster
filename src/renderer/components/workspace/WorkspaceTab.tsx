import type { Workspace } from '@shared/types/workspace';

interface WorkspaceTabProps {
  workspace: Workspace;
  isActive: boolean;
  onSelect: () => void;
}

export const WorkspaceTab = ({ workspace, isActive, onSelect }: WorkspaceTabProps): JSX.Element => {
  return (
    <button
      className={`workspace-tab ${isActive ? 'workspace-tab--active' : ''}`}
      onClick={onSelect}
      type="button"
      title={workspace.path}
    >
      {workspace.name}
    </button>
  );
};
