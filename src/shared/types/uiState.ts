import type { TerminalId } from './terminal';
import type { WorkspaceId } from './workspace';

export type SplitMode = 'single' | 'horizontal' | 'vertical' | 'grid';

export interface WindowState {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  isMaximized: boolean;
}

export interface UiState {
  activeWorkspaceId: WorkspaceId | null;
  activeTerminalId: TerminalId | null;
  splitMode: SplitMode;
  splitRatio: number;
}

export interface SaveUiStateRequest {
  activeWorkspaceId?: WorkspaceId | null;
  activeTerminalId?: TerminalId | null;
  splitMode?: SplitMode;
  splitRatio?: number;
}
