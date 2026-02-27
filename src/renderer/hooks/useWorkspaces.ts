import { useCallback, useEffect } from 'react';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';
import { transport } from '@renderer/transport';
import type { CreateWorkspaceRequest, ListWorkspacesResponse, UpdateWorkspaceRequest, Workspace } from '@shared/types/workspace';

export const useWorkspaces = () => {
  const {
    workspaces,
    activeWorkspaceId,
    setWorkspaces,
    addWorkspace,
    updateWorkspace: updateWorkspaceInStore,
    setActiveWorkspace,
    getOrderedWorkspaces,
  } = useWorkspaceStore();

  const loadWorkspaces = useCallback(async (): Promise<void> => {
    const response = await transport.invoke<ListWorkspacesResponse>('listWorkspaces');
    setWorkspaces(response.workspaces);

    // Ersten Workspace als aktiv setzen wenn keiner aktiv
    if (!useWorkspaceStore.getState().activeWorkspaceId && response.workspaces.length > 0) {
      const first = response.workspaces[0];
      if (first) {
        setActiveWorkspace(first.id);
      }
    }
  }, [setWorkspaces, setActiveWorkspace]);

  // Workspaces beim Mount laden
  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const createWorkspace = useCallback(async (request: CreateWorkspaceRequest): Promise<Workspace> => {
    const workspace = await transport.invoke<Workspace>('createWorkspace', request);
    addWorkspace(workspace);
    return workspace;
  }, [addWorkspace]);

  const switchWorkspace = useCallback(async (workspaceId: string): Promise<void> => {
    await transport.invoke<void>('switchWorkspace', workspaceId);
    setActiveWorkspace(workspaceId);
  }, [setActiveWorkspace]);

  const updateWorkspace = useCallback(async (request: UpdateWorkspaceRequest): Promise<Workspace> => {
    const workspace = await transport.invoke<Workspace>('updateWorkspace', request);
    updateWorkspaceInStore(workspace);
    return workspace;
  }, [updateWorkspaceInStore]);

  return {
    workspaces,
    activeWorkspaceId,
    loadWorkspaces,
    createWorkspace,
    switchWorkspace,
    updateWorkspace,
    getOrderedWorkspaces,
  };
};
