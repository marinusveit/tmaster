import { useState } from 'react';
import type { Workspace, WorkspaceId } from '@shared/types/workspace';
import { WorkspaceTab } from './WorkspaceTab';

interface WorkspaceTabsProps {
  workspaces: Workspace[];
  activeWorkspaceId: WorkspaceId | null;
  onSelect: (workspaceId: WorkspaceId) => void;
  onCreate: (name: string, path: string) => void;
}

export const WorkspaceTabs = ({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onCreate,
}: WorkspaceTabsProps): JSX.Element => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

  const handleCreate = () => {
    if (!newName.trim() || !newPath.trim()) {
      return;
    }

    onCreate(newName.trim(), newPath.trim());
    setNewName('');
    setNewPath('');
    setIsCreating(false);
  };

  const handleCancel = () => {
    setNewName('');
    setNewPath('');
    setIsCreating(false);
  };

  return (
    <div className="workspace-tabs">
      <div className="workspace-tabs__list">
        {workspaces.map((workspace) => (
          <WorkspaceTab
            key={workspace.id}
            workspace={workspace}
            isActive={workspace.id === activeWorkspaceId}
            onSelect={() => onSelect(workspace.id)}
          />
        ))}
        <button
          className="workspace-tabs__add"
          onClick={() => setIsCreating(true)}
          type="button"
          title="Neuer Workspace"
        >
          +
        </button>
      </div>
      {isCreating && (
        <div className="workspace-tabs__dialog">
          <input
            className="workspace-tabs__input"
            type="text"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreate();
              }
              if (e.key === 'Escape') {
                handleCancel();
              }
            }}
            autoFocus
          />
          <input
            className="workspace-tabs__input"
            type="text"
            placeholder="Pfad (z.B. /home/user/project)"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreate();
              }
              if (e.key === 'Escape') {
                handleCancel();
              }
            }}
          />
          <button className="workspace-tabs__btn" onClick={handleCreate} type="button">
            Erstellen
          </button>
          <button className="workspace-tabs__btn workspace-tabs__btn--cancel" onClick={handleCancel} type="button">
            Abbrechen
          </button>
        </div>
      )}
    </div>
  );
};
