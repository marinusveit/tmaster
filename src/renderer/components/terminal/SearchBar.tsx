import { useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TerminalId } from '@shared/types/terminal';
import {
  clearTerminalSearch,
  clearTerminalSearchActiveDecoration,
  findNextTerminalSearchMatch,
  findPreviousTerminalSearchMatch,
  updateTerminalSearch,
} from '@renderer/components/terminal/terminalInstances';
import { useTerminalStore } from '@renderer/stores/terminalStore';

interface SearchBarProps {
  terminalId: TerminalId;
  onRequestClose: () => void;
}

export const SearchBar = ({ terminalId, onRequestClose }: SearchBarProps): JSX.Element | null => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const search = useTerminalStore((state) => state.search);
  const setSearchQuery = useTerminalStore((state) => state.setSearchQuery);
  const toggleSearchCaseSensitive = useTerminalStore((state) => state.toggleSearchCaseSensitive);
  const toggleSearchRegex = useTerminalStore((state) => state.toggleSearchRegex);

  const isVisible = search.isOpen && search.terminalId === terminalId;
  const searchOptions = useMemo(() => ({
    caseSensitive: search.caseSensitive,
    regex: search.regex,
  }), [search.caseSensitive, search.regex]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    if (search.query.length === 0) {
      clearTerminalSearch(terminalId);
      return;
    }

    updateTerminalSearch(terminalId, search.query, searchOptions);
  }, [isVisible, search.query, searchOptions, terminalId]);

  const handleClose = (): void => {
    clearTerminalSearch(terminalId);
    onRequestClose();
  };

  const handleNext = (): void => {
    if (search.query.length === 0) {
      return;
    }

    findNextTerminalSearchMatch(terminalId, search.query, searchOptions);
  };

  const handlePrevious = (): void => {
    if (search.query.length === 0) {
      return;
    }

    findPreviousTerminalSearchMatch(terminalId, search.query, searchOptions);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        handlePrevious();
        return;
      }

      handleNext();
    }
  };

  if (!isVisible) {
    return null;
  }

  const currentResult = search.resultCount > 0 && search.resultIndex >= 0
    ? search.resultIndex + 1
    : 0;

  return (
    <div
      aria-label="Terminalsuche"
      className="terminal-search"
      onMouseDown={(event) => event.stopPropagation()}
      role="search"
    >
      <input
        ref={inputRef}
        className="terminal-search__input"
        onBlur={() => clearTerminalSearchActiveDecoration(terminalId)}
        onChange={(event) => setSearchQuery(event.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder="Search terminal output"
        type="text"
        value={search.query}
      />
      <span className="terminal-search__counter" aria-live="polite">
        {currentResult}/{search.resultCount}
      </span>
      <button
        aria-label="Case sensitive umschalten"
        aria-pressed={search.caseSensitive}
        className={`terminal-search__toggle${search.caseSensitive ? ' terminal-search__toggle--active' : ''}`}
        onClick={toggleSearchCaseSensitive}
        type="button"
      >
        Aa
      </button>
      <button
        aria-label="Regex umschalten"
        aria-pressed={search.regex}
        className={`terminal-search__toggle${search.regex ? ' terminal-search__toggle--active' : ''}`}
        onClick={toggleSearchRegex}
        type="button"
      >
        .*
      </button>
      <button
        className="terminal-search__button"
        onClick={handlePrevious}
        type="button"
      >
        Prev
      </button>
      <button
        className="terminal-search__button"
        onClick={handleNext}
        type="button"
      >
        Next
      </button>
      <button
        aria-label="Suche schliessen"
        className="terminal-search__close"
        onClick={handleClose}
        type="button"
      >
        Close
      </button>
    </div>
  );
};
