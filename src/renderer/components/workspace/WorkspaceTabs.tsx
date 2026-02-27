import { useState, useRef, useEffect, useCallback } from 'react';
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
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const handleCreate = () => {
    if (!newName.trim() || !newPath.trim()) {
      return;
    }

    onCreate(newName.trim(), newPath.trim());
    setNewName('');
    setNewPath('');
    setIsCreating(false);
  };

  const handleCancel = useCallback(() => {
    setNewName('');
    setNewPath('');
    setIsCreating(false);
  }, []);

  // Klick-Erkennung ausserhalb des Dialogs
  useEffect(() => {
    if (!isCreating) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        handleCancel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCreating, handleCancel]);

  return (
    <div className="workspace-tabs">
      <div className="workspace-tabs__list" role="tablist">
        {workspaces.map((workspace) => (
          <WorkspaceTab
            key={workspace.id}
            workspace={workspace}
            isActive={workspace.id === activeWorkspaceId}
            onSelect={() => onSelect(workspace.id)}
          />
        ))}
        <div className="workspace-tabs__dialog-wrapper" ref={dialogRef}>
          <button
            className="workspace-tabs__add"
            onClick={() => setIsCreating(true)}
            type="button"
            title="Neuer Workspace"
            aria-label="Neuen Workspace erstellen"
          >
            +
          </button>
          {isCreating && (
            <div className="workspace-tabs__dialog">
              <div>
                <label className="workspace-tabs__dialog-label" htmlFor="workspace-name">
                  Name
                </label>
                <input
                  id="workspace-name"
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
              </div>
              <div>
                <label className="workspace-tabs__dialog-label" htmlFor="workspace-path">
                  Pfad
                </label>
                <input
                  id="workspace-path"
                  className="workspace-tabs__input"
                  type="text"
                  placeholder="z.B. /home/user/project"
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
              </div>
              <div className="workspace-tabs__dialog-actions">
                <button className="workspace-tabs__btn workspace-tabs__btn--cancel" onClick={handleCancel} type="button">
                  Abbrechen
                </button>
                <button className="workspace-tabs__btn" onClick={handleCreate} type="button">
                  Erstellen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
