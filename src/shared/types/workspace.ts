export type WorkspaceId = string;

export interface Workspace {
  id: WorkspaceId;
  name: string;
  path: string;
  nextTerminalIndex: number;
  createdAt: number;
}

export interface CreateWorkspaceRequest {
  name: string;
  path: string;
}

export interface UpdateWorkspaceRequest {
  id: WorkspaceId;
  name?: string;
  path?: string;
}

export interface ListWorkspacesResponse {
  workspaces: Workspace[];
}
