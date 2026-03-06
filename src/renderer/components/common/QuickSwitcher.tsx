import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { ListSessionsResponse } from '@shared/types/session';
import type { TerminalId, TerminalSessionInfo, TerminalStatus } from '@shared/types/terminal';
import type { Workspace } from '@shared/types/workspace';
import { transport } from '@renderer/transport';
import { useQuickSwitcherStore } from '@renderer/stores/quickSwitcherStore';
import { fuzzySearch } from '@renderer/utils/fuzzySearch';
import { detectAgentType } from '../../../common/agent/detectAgentType';

interface QuickSwitcherProps {
  terminals: TerminalSessionInfo[];
  workspaces: Workspace[];
  activeTerminalId: TerminalId | null;
  onSelectTerminal: (terminalId: TerminalId) => void;
}

interface QuickSwitcherItem {
  terminal: TerminalSessionInfo;
  terminalLabel: string;
  agentType: string;
  statusLabel: string;
  workspaceName: string;
  searchableText: string;
}

const STATUS_LABELS: Record<TerminalStatus, string> = {
  active: 'Aktiv',
  idle: 'Inaktiv',
  exited: 'Beendet',
};

const STATUS_DOT_CLASSES: Record<TerminalStatus, string> = {
  active: 'status-dot--active',
  idle: 'status-dot--idle',
  exited: 'status-dot--exited',
};

const inferAgentTypeFromPrefix = (prefix: string): string => {
  const normalizedPrefix = prefix.trim().toLowerCase();
  if (normalizedPrefix.length === 0 || normalizedPrefix === 't' || normalizedPrefix === 'terminal') {
    return 'unknown';
  }

  return normalizedPrefix;
};

const getLabelHighlights = (label: string, query: string): Set<number> => {
  if (query.trim().length === 0) {
    return new Set();
  }

  const matches = fuzzySearch([label], query, (item) => item);
  const highlights = matches[0]?.highlights ?? [];
  return new Set(highlights);
};

const highlightLabel = (label: string, query: string): JSX.Element[] => {
  const highlights = getLabelHighlights(label, query);

  return label.split('').map((char, index) => {
    const shouldHighlight = highlights.has(index);
    return (
      <span
        key={`${char}-${index}`}
        className={shouldHighlight ? 'quick-switcher__label-char quick-switcher__label-char--highlight' : 'quick-switcher__label-char'}
      >
        {char}
      </span>
    );
  });
};

export const QuickSwitcher = ({
  terminals,
  workspaces,
  activeTerminalId,
  onSelectTerminal,
}: QuickSwitcherProps): JSX.Element | null => {
  const isOpen = useQuickSwitcherStore((state) => state.isOpen);
  const query = useQuickSwitcherStore((state) => state.query);
  const selectedIndex = useQuickSwitcherStore((state) => state.selectedIndex);
  const close = useQuickSwitcherStore((state) => state.close);
  const setQuery = useQuickSwitcherStore((state) => state.setQuery);
  const moveUp = useQuickSwitcherStore((state) => state.moveUp);
  const moveDown = useQuickSwitcherStore((state) => state.moveDown);
  const resetSelection = useQuickSwitcherStore((state) => state.resetSelection);

  const [agentTypeByTerminalId, setAgentTypeByTerminalId] = useState<Record<TerminalId, string>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCancelled = false;

    const loadSessionAgentTypes = async (): Promise<void> => {
      try {
        const response = await transport.invoke<ListSessionsResponse>('listSessions', {});
        const nextByTerminalId: Record<TerminalId, string> = {};

        for (const session of response.sessions) {
          const agentType = detectAgentType(session.shell);
          nextByTerminalId[session.terminalId] = agentType;
        }

        if (!isCancelled) {
          setAgentTypeByTerminalId(nextByTerminalId);
        }
      } catch {
        if (!isCancelled) {
          setAgentTypeByTerminalId({});
        }
      }
    };

    void loadSessionAgentTypes();

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  const workspaceNameById = useMemo(() => {
    const nameMap = new Map<string, string>();
    for (const workspace of workspaces) {
      nameMap.set(workspace.id, workspace.name);
    }
    return nameMap;
  }, [workspaces]);

  const quickSwitcherItems = useMemo<QuickSwitcherItem[]>(() => {
    return terminals.map((terminal) => {
      const terminalLabel = `${terminal.label.prefix}${terminal.label.index}`;
      const agentType = agentTypeByTerminalId[terminal.terminalId] ?? inferAgentTypeFromPrefix(terminal.label.prefix);
      const statusLabel = STATUS_LABELS[terminal.status] ?? terminal.status;
      const workspaceName = workspaceNameById.get(terminal.workspaceId) ?? 'Unknown Workspace';

      return {
        terminal,
        terminalLabel,
        agentType,
        statusLabel,
        workspaceName,
        searchableText: `${terminalLabel} ${agentType} ${statusLabel} ${terminal.status} ${workspaceName}`,
      };
    });
  }, [terminals, workspaceNameById, agentTypeByTerminalId]);

  const rankedResults = useMemo(() => {
    const matches = fuzzySearch(quickSwitcherItems, query, (item) => item.searchableText);

    // Aktives Terminal bei gleichem Score bevorzugen.
    return matches.sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const leftActive = left.item.terminal.terminalId === activeTerminalId;
      const rightActive = right.item.terminal.terminalId === activeTerminalId;
      if (leftActive === rightActive) {
        return left.item.terminal.label.index - right.item.terminal.label.index;
      }

      return rightActive ? 1 : -1;
    });
  }, [quickSwitcherItems, query, activeTerminalId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (rankedResults.length === 0) {
      if (selectedIndex !== 0) {
        resetSelection();
      }
      return;
    }

    const maxIndex = rankedResults.length - 1;
    if (selectedIndex > maxIndex) {
      resetSelection();
    }
  }, [isOpen, rankedResults.length, selectedIndex, resetSelection]);

  const selectedResultIndex = rankedResults.length === 0
    ? 0
    : Math.min(selectedIndex, rankedResults.length - 1);

  const chooseTerminal = useCallback((terminalId: TerminalId) => {
    onSelectTerminal(terminalId);
    close();
  }, [onSelectTerminal, close]);

  const onInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (rankedResults.length === 0 || selectedIndex >= rankedResults.length - 1) {
        return;
      }

      moveDown();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (selectedIndex <= 0) {
        return;
      }

      moveUp();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = rankedResults[selectedResultIndex];
      if (selected) {
        chooseTerminal(selected.item.terminal.terminalId);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }, [moveDown, moveUp, rankedResults, selectedIndex, selectedResultIndex, chooseTerminal, close]);

  const onBackdropClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    close();
  }, [close]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="quick-switcher" role="dialog" aria-modal="true" aria-label="Quick-Switcher" onMouseDown={onBackdropClick}>
      <div className="quick-switcher__panel">
        <div className="quick-switcher__search-row">
          <input
            ref={inputRef}
            className="quick-switcher__input"
            type="text"
            value={query}
            placeholder="Terminal suchen (Label, Agent, Status, Workspace)"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            aria-label="Terminal suchen"
          />
        </div>
        <div className="quick-switcher__results" role="listbox" aria-label="Terminal Suchergebnisse">
          {rankedResults.length === 0 && (
            <div className="quick-switcher__empty">Kein Terminal gefunden</div>
          )}
          {rankedResults.map((result, index) => {
            const { terminal, terminalLabel, agentType, statusLabel, workspaceName } = result.item;
            const isSelected = index === selectedResultIndex;
            const dotClassName = STATUS_DOT_CLASSES[terminal.status] ?? 'status-dot--idle';

            return (
              <button
                key={terminal.terminalId}
                className={`quick-switcher__item${isSelected ? ' quick-switcher__item--selected' : ''}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => chooseTerminal(terminal.terminalId)}
              >
                <span className={`status-dot ${dotClassName}`} aria-hidden="true" />
                <span className="quick-switcher__item-label">{highlightLabel(terminalLabel, query)}</span>
                <span className="quick-switcher__item-agent">{agentType}</span>
                <span className="quick-switcher__item-status">{statusLabel}</span>
                <span className="quick-switcher__item-workspace">{workspaceName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
