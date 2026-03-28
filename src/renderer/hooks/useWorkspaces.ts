import { useCallback, useEffect } from 'react';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';
import { transport } from '@renderer/transport';
import type { CreateWorkspaceRequest, ListWorkspacesResponse, UpdateWorkspaceRequest, Workspace } from '@shared/types/workspace';
import type { UiState } from '@shared/types/uiState';

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

    const currentActiveWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId;
    if (
      currentActiveWorkspaceId
      && response.workspaces.some((workspace) => workspace.id === currentActiveWorkspaceId)
    ) {
      return;
    }

    const uiState = await transport.invoke<UiState>('getUiState');
    const restoredWorkspaceId = response.workspaces.find(
      (workspace) => workspace.id === uiState.activeWorkspaceId,
    )?.id ?? response.workspaces[0]?.id ?? null;

    if (!restoredWorkspaceId) {
      return;
    }

    setActiveWorkspace(restoredWorkspaceId);

    if (restoredWorkspaceId !== uiState.activeWorkspaceId) {
      await transport.invoke<UiState>('saveUiState', {
        activeWorkspaceId: restoredWorkspaceId,
      });
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
    await transport.invoke<UiState>('saveUiState', {
      activeWorkspaceId: workspaceId,
    });
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
