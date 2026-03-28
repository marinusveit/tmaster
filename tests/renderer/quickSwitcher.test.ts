import { describe, expect, it } from 'vitest';
import type { TerminalSessionInfo } from '@shared/types/terminal';
import type { Workspace } from '@shared/types/workspace';
import {
  buildQuickSwitcherItems,
  getNextQuickSwitcherIndex,
  getSelectedQuickSwitcherItem,
  isQuickSwitcherShortcut,
  rankQuickSwitcherItems,
} from '@renderer/utils/quickSwitcher';

const workspaces: Workspace[] = [
  {
    id: 'ws-core',
    name: 'Core API',
    path: '/srv/core-api',
    nextTerminalIndex: 3,
    createdAt: 1,
  },
  {
    id: 'ws-ops',
    name: 'Ops Console',
    path: '/srv/ops-console',
    nextTerminalIndex: 2,
    createdAt: 2,
  },
];

const terminals: TerminalSessionInfo[] = [
  {
    terminalId: 'term-a',
    label: { prefix: 'codex-', index: 1 },
    workspaceId: 'ws-core',
    status: 'active',
    createdAt: 10,
  },
  {
    terminalId: 'term-b',
    label: { prefix: 'claude-', index: 2 },
    workspaceId: 'ws-ops',
    status: 'idle',
    createdAt: 11,
  },
];

describe('quickSwitcher utils', () => {
  it('baut Terminal- und Workspace-Einträge mit Statusinformationen', () => {
    const items = buildQuickSwitcherItems({
      terminals,
      workspaces,
      agentTypeByTerminalId: {
        'term-a': 'codex',
        'term-b': 'claude',
      },
    });

    expect(items).toHaveLength(4);
    expect(items.some((item) => item.kind === 'workspace' && item.title === 'Ops Console')).toBe(true);
    expect(items.some((item) => item.kind === 'terminal' && item.title === 'codex-1')).toBe(true);

    const workspaceItem = items.find((item) => item.kind === 'workspace' && item.workspaceId === 'ws-core');
    expect(workspaceItem?.statusLabel).toContain('1 Terminal');
    expect(workspaceItem?.statusLabel).toContain('1 aktiv');
  });

  it('rankt exakte Workspace-Treffer vor bloßen Kontext-Treffern', () => {
    const items = buildQuickSwitcherItems({
      terminals,
      workspaces,
      agentTypeByTerminalId: {
        'term-a': 'codex',
        'term-b': 'claude',
      },
    });

    const results = rankQuickSwitcherItems(items, 'ops console', {
      activeTerminalId: 'term-a',
      activeWorkspaceId: 'ws-core',
    });

    expect(results[0]?.item.kind).toBe('workspace');
    expect(results[0]?.item.title).toBe('Ops Console');
  });

  it('bevorzugt das aktive Terminal bei leerer Suche', () => {
    const items = buildQuickSwitcherItems({
      terminals,
      workspaces,
      agentTypeByTerminalId: {
        'term-a': 'codex',
        'term-b': 'claude',
      },
    });

    const results = rankQuickSwitcherItems(items, '', {
      activeTerminalId: 'term-a',
      activeWorkspaceId: 'ws-core',
    });

    expect(results[0]?.item.kind).toBe('terminal');
    if (results[0]?.item.kind !== 'terminal') {
      throw new Error('expected terminal result');
    }

    expect(results[0].item.terminal.terminalId).toBe('term-a');
  });

  it('bewegt die Auswahl per Pfeiltasten innerhalb der Ergebnisgrenzen', () => {
    expect(getNextQuickSwitcherIndex(0, 3, 'down')).toBe(1);
    expect(getNextQuickSwitcherIndex(2, 3, 'down')).toBe(2);
    expect(getNextQuickSwitcherIndex(0, 3, 'up')).toBe(0);
    expect(getNextQuickSwitcherIndex(2, 3, 'up')).toBe(1);
  });

  it('liefert das aktuell ausgewählte Ergebnis für Enter-Selektion', () => {
    const items = buildQuickSwitcherItems({
      terminals,
      workspaces,
      agentTypeByTerminalId: {
        'term-a': 'codex',
        'term-b': 'claude',
      },
    });

    const results = rankQuickSwitcherItems(items, 'claude', {
      activeTerminalId: 'term-a',
      activeWorkspaceId: 'ws-core',
    });

    const selected = getSelectedQuickSwitcherItem(results, 0);

    expect(selected).not.toBeNull();
    expect(selected?.item.kind).toBe('terminal');
    if (selected?.item.kind !== 'terminal') {
      throw new Error('expected terminal selection');
    }

    expect(selected.item.terminal.terminalId).toBe('term-b');
  });

  it('erkennt Cmd+K und Ctrl+K als Quick-Switcher-Shortcut', () => {
    expect(isQuickSwitcherShortcut({
      key: 'k',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    })).toBe(true);

    expect(isQuickSwitcherShortcut({
      key: 'K',
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
    })).toBe(true);

    expect(isQuickSwitcherShortcut({
      key: 'k',
      metaKey: true,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
    })).toBe(false);
  });
});
