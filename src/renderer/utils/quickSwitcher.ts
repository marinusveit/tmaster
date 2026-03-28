import type { TerminalId, TerminalSessionInfo, TerminalStatus } from '@shared/types/terminal';
import type { Workspace, WorkspaceId } from '@shared/types/workspace';
import { scoreFuzzyMatch } from '@renderer/utils/fuzzySearch';

interface QuickSwitcherBaseItem {
  id: string;
  title: string;
  subtitle: string;
  searchableText: string;
  statusLabel: string;
  statusTone: TerminalStatus;
}

export interface QuickSwitcherTerminalItem extends QuickSwitcherBaseItem {
  kind: 'terminal';
  terminal: TerminalSessionInfo;
  terminalLabel: string;
  workspaceId: WorkspaceId;
  workspaceName: string;
  agentType: string;
}

export interface QuickSwitcherWorkspaceItem extends QuickSwitcherBaseItem {
  kind: 'workspace';
  workspace: Workspace;
  workspaceId: WorkspaceId;
  terminalCount: number;
  activeCount: number;
  idleCount: number;
  exitedCount: number;
}

export type QuickSwitcherItem = QuickSwitcherTerminalItem | QuickSwitcherWorkspaceItem;

export interface RankedQuickSwitcherItem {
  item: QuickSwitcherItem;
  score: number;
  highlights: number[];
}

interface BuildQuickSwitcherItemsOptions {
  terminals: TerminalSessionInfo[];
  workspaces: Workspace[];
  agentTypeByTerminalId: Partial<Record<TerminalId, string>>;
}

interface RankQuickSwitcherItemsOptions {
  activeTerminalId: TerminalId | null;
  activeWorkspaceId: WorkspaceId | null;
}

export type QuickSwitcherNavigationDirection = 'up' | 'down';

const TERMINAL_STATUS_LABELS: Record<TerminalStatus, string> = {
  active: 'Aktiv',
  idle: 'Inaktiv',
  exited: 'Beendet',
};

const getWorkspaceStatusTone = (terminals: TerminalSessionInfo[]): TerminalStatus => {
  if (terminals.some((terminal) => terminal.status === 'active')) {
    return 'active';
  }

  if (terminals.some((terminal) => terminal.status === 'idle')) {
    return 'idle';
  }

  return terminals.length > 0 ? 'exited' : 'idle';
};

const formatWorkspaceStatusLabel = (
  terminalCount: number,
  activeCount: number,
  idleCount: number,
  exitedCount: number,
): string => {
  const parts: string[] = [`${terminalCount} ${terminalCount === 1 ? 'Terminal' : 'Terminals'}`];

  if (activeCount > 0) {
    parts.push(`${activeCount} aktiv`);
  }

  if (idleCount > 0) {
    parts.push(`${idleCount} inaktiv`);
  }

  if (exitedCount > 0) {
    parts.push(`${exitedCount} beendet`);
  }

  return parts.join(' · ');
};

const getRankedMatch = (item: QuickSwitcherItem, query: string) => {
  const titleMatch = scoreFuzzyMatch(item.title, query);
  const searchMatch = scoreFuzzyMatch(item.searchableText, query);

  if (!titleMatch && !searchMatch) {
    return null;
  }

  const preferredMatch = titleMatch ?? searchMatch;
  if (!preferredMatch) {
    return null;
  }

  let score = preferredMatch.score;

  if (titleMatch) {
    score = Math.max(score, Math.min(1, titleMatch.score + 0.08));
  }

  if (item.kind === 'terminal' && item.statusTone === 'active') {
    score = Math.min(1, score + 0.02);
  }

  return {
    score,
    highlights: titleMatch?.highlights ?? [],
  };
};

export const buildQuickSwitcherItems = ({
  terminals,
  workspaces,
  agentTypeByTerminalId,
}: BuildQuickSwitcherItemsOptions): QuickSwitcherItem[] => {
  const terminalsByWorkspaceId = new Map<WorkspaceId, TerminalSessionInfo[]>();

  for (const terminal of terminals) {
    const existing = terminalsByWorkspaceId.get(terminal.workspaceId) ?? [];
    existing.push(terminal);
    terminalsByWorkspaceId.set(terminal.workspaceId, existing);
  }

  const workspaceItems: QuickSwitcherWorkspaceItem[] = workspaces.map((workspace) => {
    const workspaceTerminals = terminalsByWorkspaceId.get(workspace.id) ?? [];
    const activeCount = workspaceTerminals.filter((terminal) => terminal.status === 'active').length;
    const idleCount = workspaceTerminals.filter((terminal) => terminal.status === 'idle').length;
    const exitedCount = workspaceTerminals.filter((terminal) => terminal.status === 'exited').length;
    const terminalCount = workspaceTerminals.length;
    const statusLabel = formatWorkspaceStatusLabel(terminalCount, activeCount, idleCount, exitedCount);

    return {
      kind: 'workspace',
      id: `workspace:${workspace.id}`,
      workspace,
      workspaceId: workspace.id,
      terminalCount,
      activeCount,
      idleCount,
      exitedCount,
      title: workspace.name,
      subtitle: workspace.path,
      searchableText: `${workspace.name} ${workspace.path} workspace ${statusLabel}`,
      statusLabel,
      statusTone: getWorkspaceStatusTone(workspaceTerminals),
    };
  });

  const workspaceNameById = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  const terminalItems: QuickSwitcherTerminalItem[] = terminals.map((terminal) => {
    const terminalLabel = `${terminal.label.prefix}${terminal.label.index}`;
    const workspaceName = workspaceNameById.get(terminal.workspaceId) ?? 'Unknown Workspace';
    const agentType = (agentTypeByTerminalId[terminal.terminalId] ?? terminal.label.prefix.trim().toLowerCase()) || 'unknown';
    const statusLabel = TERMINAL_STATUS_LABELS[terminal.status] ?? terminal.status;

    return {
      kind: 'terminal',
      id: `terminal:${terminal.terminalId}`,
      terminal,
      terminalLabel,
      workspaceId: terminal.workspaceId,
      workspaceName,
      agentType,
      title: terminalLabel,
      subtitle: `${workspaceName} · ${agentType}`,
      searchableText: `${terminalLabel} terminal ${workspaceName} ${agentType} ${statusLabel} ${terminal.status}`,
      statusLabel,
      statusTone: terminal.status,
    };
  });

  return [...terminalItems, ...workspaceItems];
};

export const rankQuickSwitcherItems = (
  items: QuickSwitcherItem[],
  query: string,
  { activeTerminalId, activeWorkspaceId }: RankQuickSwitcherItemsOptions,
): RankedQuickSwitcherItem[] => {
  const rankedResults: RankedQuickSwitcherItem[] = [];

  for (const item of items) {
    const rankedMatch = getRankedMatch(item, query);
    if (!rankedMatch) {
      continue;
    }

    rankedResults.push({
      item,
      score: rankedMatch.score,
      highlights: rankedMatch.highlights,
    });
  }

  return rankedResults.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const leftIsActiveTerminal = left.item.kind === 'terminal' && left.item.terminal.terminalId === activeTerminalId;
    const rightIsActiveTerminal = right.item.kind === 'terminal' && right.item.terminal.terminalId === activeTerminalId;
    if (leftIsActiveTerminal !== rightIsActiveTerminal) {
      return leftIsActiveTerminal ? -1 : 1;
    }

    const leftIsActiveWorkspace = left.item.kind === 'workspace' && left.item.workspaceId === activeWorkspaceId;
    const rightIsActiveWorkspace = right.item.kind === 'workspace' && right.item.workspaceId === activeWorkspaceId;
    if (leftIsActiveWorkspace !== rightIsActiveWorkspace) {
      return leftIsActiveWorkspace ? -1 : 1;
    }

    if (left.item.kind !== right.item.kind) {
      return left.item.kind === 'terminal' ? -1 : 1;
    }

    return left.item.title.localeCompare(right.item.title);
  });
};

export const clampQuickSwitcherSelection = (selectedIndex: number, itemCount: number): number => {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(selectedIndex, itemCount - 1));
};

export const getNextQuickSwitcherIndex = (
  selectedIndex: number,
  itemCount: number,
  direction: QuickSwitcherNavigationDirection,
): number => {
  if (direction === 'down') {
    return clampQuickSwitcherSelection(selectedIndex + 1, itemCount);
  }

  return clampQuickSwitcherSelection(selectedIndex - 1, itemCount);
};

export const getSelectedQuickSwitcherItem = (
  rankedResults: RankedQuickSwitcherItem[],
  selectedIndex: number,
): RankedQuickSwitcherItem | null => {
  const clampedIndex = clampQuickSwitcherSelection(selectedIndex, rankedResults.length);
  return rankedResults[clampedIndex] ?? null;
};

export const isQuickSwitcherShortcut = (event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean => {
  return (event.metaKey || event.ctrlKey)
    && !event.shiftKey
    && !event.altKey
    && event.key.toLowerCase() === 'k';
};
