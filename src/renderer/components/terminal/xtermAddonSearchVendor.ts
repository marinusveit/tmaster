import '../../../../vendor/xtermAddonSearchVendor.js';
import type { IEvent, ITerminalAddon, Terminal } from 'xterm';

export interface SearchDecorationOptions {
  matchBackground?: string;
  matchBorder?: string;
  matchOverviewRuler: string;
  activeMatchBackground?: string;
  activeMatchBorder?: string;
  activeMatchColorOverviewRuler: string;
}

export interface SearchOptions {
  regex?: boolean;
  wholeWord?: boolean;
  caseSensitive?: boolean;
  incremental?: boolean;
  decorations?: SearchDecorationOptions;
}

export interface SearchAddonOptions {
  highlightLimit: number;
}

export interface SearchResultChangeEvent {
  resultIndex: number;
  resultCount: number;
}

export interface SearchAddonConstructor {
  new (options?: Partial<SearchAddonOptions>): SearchAddonInstance;
}

export interface SearchAddonInstance extends ITerminalAddon {
  activate(terminal: Terminal): void;
  dispose(): void;
  findNext(term: string, searchOptions?: SearchOptions): boolean;
  findPrevious(term: string, searchOptions?: SearchOptions): boolean;
  clearDecorations(): void;
  clearActiveDecoration(): void;
  readonly onDidChangeResults: IEvent<SearchResultChangeEvent>;
}

interface SearchAddonModuleNamespace {
  SearchAddon?: SearchAddonConstructor;
}

interface SearchAddonGlobal {
  SearchAddon?: SearchAddonConstructor | SearchAddonModuleNamespace;
}

const resolveSearchAddon = (): SearchAddonConstructor => {
  const globalSearchAddon = (globalThis as typeof globalThis & SearchAddonGlobal).SearchAddon;

  if (typeof globalSearchAddon === 'function') {
    return globalSearchAddon as SearchAddonConstructor;
  }

  if (
    typeof globalSearchAddon === 'object' &&
    globalSearchAddon !== null &&
    'SearchAddon' in globalSearchAddon
  ) {
    const namespace = globalSearchAddon as SearchAddonModuleNamespace;
    if (namespace.SearchAddon) {
      return namespace.SearchAddon;
    }
  }

  throw new Error('Vendored xterm search addon could not be resolved.');
};

export const SearchAddon = resolveSearchAddon();
