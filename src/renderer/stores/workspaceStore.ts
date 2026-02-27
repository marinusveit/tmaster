import { create } from 'zustand';
import type { Workspace, WorkspaceId } from '@shared/types/workspace';

interface WorkspaceStoreState {
  workspaces: Map<WorkspaceId, Workspace>;
  activeWorkspaceId: WorkspaceId | null;
}

interface WorkspaceStoreActions {
  setWorkspaces: (workspaces: Workspace[]) => void;
  addWorkspace: (workspace: Workspace) => void;
  updateWorkspace: (workspace: Workspace) => void;
  setActiveWorkspace: (workspaceId: WorkspaceId) => void;
  getOrderedWorkspaces: () => Workspace[];
}

export type WorkspaceStore = WorkspaceStoreState & WorkspaceStoreActions;

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: new Map(),
  activeWorkspaceId: null,

  setWorkspaces: (workspaces) => {
    const map = new Map<WorkspaceId, Workspace>();
    for (const ws of workspaces) {
      map.set(ws.id, ws);
    }
    set({ workspaces: map });
  },

  addWorkspace: (workspace) => {
    set((state) => {
      const next = new Map(state.workspaces);
      next.set(workspace.id, workspace);
      return { workspaces: next };
    });
  },

  updateWorkspace: (workspace) => {
    set((state) => {
      const existing = state.workspaces.get(workspace.id);
      if (!existing) {
        return state;
      }

      const next = new Map(state.workspaces);
      next.set(workspace.id, workspace);
      return { workspaces: next };
    });
  },

  setActiveWorkspace: (workspaceId) => {
    set({ activeWorkspaceId: workspaceId });
  },

  getOrderedWorkspaces: () => {
    const { workspaces } = get();
    return [...workspaces.values()].sort((a, b) => a.createdAt - b.createdAt);
  },
}));
