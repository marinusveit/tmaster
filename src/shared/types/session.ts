export interface SessionInfo {
  id: string;
  terminalId: string;
  workspaceId: string;
  labelPrefix: string;
  labelIndex: number;
  displayOrder?: number;
  status: string;
  createdAt: number;
  endedAt: number | null;
  shell: string | null;
}

export interface ListSessionsRequest {
  workspaceId?: string;
}

export interface ListSessionsResponse {
  sessions: SessionInfo[];
}
