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
import type { Workspace, WorkspaceId } from '@shared/types/workspace';
import { transport } from '@renderer/transport';
import { useQuickSwitcherStore } from '@renderer/stores/quickSwitcherStore';
import {
  buildQuickSwitcherItems,
  clampQuickSwitcherSelection,
  getNextQuickSwitcherIndex,
  getSelectedQuickSwitcherItem,
  rankQuickSwitcherItems,
  type QuickSwitcherItem,
} from '@renderer/utils/quickSwitcher';
import { detectAgentType } from '../../../common/agent/detectAgentType';

interface QuickSwitcherProps {
  terminals: TerminalSessionInfo[];
  workspaces: Workspace[];
  activeTerminalId: TerminalId | null;
  activeWorkspaceId: WorkspaceId | null;
  onSelectItem: (item: QuickSwitcherItem) => void;
}

const STATUS_DOT_CLASSES: Record<TerminalStatus, string> = {
  active: 'status-dot--active',
  idle: 'status-dot--idle',
  exited: 'status-dot--exited',
};

const highlightLabel = (label: string, highlights: number[]): JSX.Element[] => {
  const highlightSet = new Set(highlights);

  return label.split('').map((char, index) => {
    const isHighlighted = highlightSet.has(index);
    return (
      <span
        key={`${char}-${index}`}
        className={isHighlighted ? 'quick-switcher__label-char quick-switcher__label-char--highlight' : 'quick-switcher__label-char'}
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
  activeWorkspaceId,
  onSelectItem,
}: QuickSwitcherProps): JSX.Element | null => {
  const isOpen = useQuickSwitcherStore((state) => state.isOpen);
  const query = useQuickSwitcherStore((state) => state.query);
  const selectedIndex = useQuickSwitcherStore((state) => state.selectedIndex);
  const close = useQuickSwitcherStore((state) => state.close);
  const setQuery = useQuickSwitcherStore((state) => state.setQuery);
  const setSelectedIndex = useQuickSwitcherStore((state) => state.setSelectedIndex);
  const moveUp = useQuickSwitcherStore((state) => state.moveUp);
  const moveDown = useQuickSwitcherStore((state) => state.moveDown);

  const [agentTypeByTerminalId, setAgentTypeByTerminalId] = useState<Record<TerminalId, string>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const previousOpenStateRef = useRef(false);
  const shouldRestoreFocusRef = useRef(true);

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
          nextByTerminalId[session.terminalId] = detectAgentType(session.shell);
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
    if (isOpen && !previousOpenStateRef.current) {
      previousFocusedElementRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      shouldRestoreFocusRef.current = true;
      inputRef.current?.focus();
    }

    if (!isOpen && previousOpenStateRef.current) {
      if (shouldRestoreFocusRef.current) {
        previousFocusedElementRef.current?.focus();
      }

      previousFocusedElementRef.current = null;
      shouldRestoreFocusRef.current = true;
    }

    previousOpenStateRef.current = isOpen;
  }, [isOpen]);

  const quickSwitcherItems = useMemo(() => {
    return buildQuickSwitcherItems({
      terminals,
      workspaces,
      agentTypeByTerminalId,
    });
  }, [terminals, workspaces, agentTypeByTerminalId]);

  const rankedResults = useMemo(() => {
    return rankQuickSwitcherItems(quickSwitcherItems, query, {
      activeTerminalId,
      activeWorkspaceId,
    });
  }, [quickSwitcherItems, query, activeTerminalId, activeWorkspaceId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const clampedIndex = clampQuickSwitcherSelection(selectedIndex, rankedResults.length);
    if (clampedIndex !== selectedIndex) {
      setSelectedIndex(clampedIndex);
    }
  }, [isOpen, rankedResults.length, selectedIndex, setSelectedIndex]);

  const closeAndRestoreFocus = useCallback(() => {
    shouldRestoreFocusRef.current = true;
    close();
  }, [close]);

  const chooseItem = useCallback((item: QuickSwitcherItem) => {
    shouldRestoreFocusRef.current = false;
    close();
    onSelectItem(item);
  }, [close, onSelectItem]);

  const onInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = getNextQuickSwitcherIndex(selectedIndex, rankedResults.length, 'down');
      if (nextIndex !== selectedIndex) {
        moveDown();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = getNextQuickSwitcherIndex(selectedIndex, rankedResults.length, 'up');
      if (nextIndex !== selectedIndex) {
        moveUp();
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedItem = getSelectedQuickSwitcherItem(rankedResults, selectedIndex);
      if (selectedItem) {
        chooseItem(selectedItem.item);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndRestoreFocus();
    }
  }, [closeAndRestoreFocus, chooseItem, moveDown, moveUp, rankedResults, selectedIndex]);

  const onBackdropClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    closeAndRestoreFocus();
  }, [closeAndRestoreFocus]);

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
            placeholder="Terminale oder Workspaces suchen"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            aria-label="Terminale oder Workspaces suchen"
          />
        </div>
        <div className="quick-switcher__results" role="listbox" aria-label="Quick-Switcher Suchergebnisse">
          {rankedResults.length === 0 && (
            <div className="quick-switcher__empty">Kein passendes Terminal oder Workspace gefunden</div>
          )}
          {rankedResults.map((result, index) => {
            const isSelected = index === clampQuickSwitcherSelection(selectedIndex, rankedResults.length);
            const dotClassName = STATUS_DOT_CLASSES[result.item.statusTone] ?? 'status-dot--idle';
            const itemTypeLabel = result.item.kind === 'terminal' ? 'Terminal' : 'Workspace';

            return (
              <button
                key={result.item.id}
                className={`quick-switcher__item${isSelected ? ' quick-switcher__item--selected' : ''}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => chooseItem(result.item)}
              >
                <span className={`status-dot ${dotClassName}`} aria-hidden="true" />
                <span className="quick-switcher__item-main">
                  <span className="quick-switcher__item-label">{highlightLabel(result.item.title, result.highlights)}</span>
                  <span className="quick-switcher__item-subtitle">{result.item.subtitle}</span>
                </span>
                <span className="quick-switcher__item-kind">{itemTypeLabel}</span>
                <span className="quick-switcher__item-status">{result.item.statusLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
