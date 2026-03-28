declare module 'xterm-addon-search' {
  import type { IEvent, ITerminalAddon, Terminal } from 'xterm';

  export interface ISearchDecorationOptions {
    matchBackground?: string;
    matchBorder?: string;
    matchOverviewRuler: string;
    activeMatchBackground?: string;
    activeMatchBorder?: string;
    activeMatchColorOverviewRuler: string;
  }

  export interface ISearchOptions {
    regex?: boolean;
    wholeWord?: boolean;
    caseSensitive?: boolean;
    incremental?: boolean;
    decorations?: ISearchDecorationOptions;
  }

  export interface ISearchAddonOptions {
    highlightLimit: number;
  }

  export interface ISearchResultChangeEvent {
    resultIndex: number;
    resultCount: number;
  }

  export class SearchAddon implements ITerminalAddon {
    public constructor(options?: Partial<ISearchAddonOptions>);
    public activate(terminal: Terminal): void;
    public dispose(): void;
    public findNext(term: string, searchOptions?: ISearchOptions): boolean;
    public findPrevious(term: string, searchOptions?: ISearchOptions): boolean;
    public clearDecorations(): void;
    public clearActiveDecoration(): void;
    public readonly onDidChangeResults: IEvent<ISearchResultChangeEvent>;
  }
}
