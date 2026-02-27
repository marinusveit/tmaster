import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';
import type { Workspace } from '@shared/types/workspace';

const makeWorkspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: `ws-${Math.random().toString(36).slice(2)}`,
  name: 'Test Workspace',
  path: '/home/user/projects/test',
  nextTerminalIndex: 1,
  createdAt: Date.now(),
  ...overrides,
});

describe('workspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspaces: new Map(),
      activeWorkspaceId: null,
    });
  });

  it('setzt Workspaces als Batch und gibt sie sortiert zurück', () => {
    const store = useWorkspaceStore.getState();
    const ws1 = makeWorkspace({ id: 'ws1', name: 'Alpha', createdAt: 200 });
    const ws2 = makeWorkspace({ id: 'ws2', name: 'Beta', createdAt: 100 });

    store.setWorkspaces([ws1, ws2]);

    const ordered = useWorkspaceStore.getState().getOrderedWorkspaces();
    expect(ordered).toHaveLength(2);
    expect(ordered[0]?.id).toBe('ws2'); // Älterer zuerst
    expect(ordered[1]?.id).toBe('ws1');
  });

  it('fügt einzelnen Workspace hinzu', () => {
    const store = useWorkspaceStore.getState();
    const ws = makeWorkspace({ id: 'ws1' });

    store.addWorkspace(ws);
    expect(useWorkspaceStore.getState().workspaces.size).toBe(1);
    expect(useWorkspaceStore.getState().workspaces.get('ws1')).toEqual(ws);
  });

  it('updated einen bestehenden Workspace', () => {
    const store = useWorkspaceStore.getState();
    const ws = makeWorkspace({ id: 'ws1', name: 'Original' });
    store.addWorkspace(ws);

    store.updateWorkspace({ ...ws, name: 'Updated' });
    expect(useWorkspaceStore.getState().workspaces.get('ws1')?.name).toBe('Updated');
  });

  it('ignoriert Update für nicht-existierenden Workspace', () => {
    const store = useWorkspaceStore.getState();
    const ws = makeWorkspace({ id: 'ws-unknown' });

    store.updateWorkspace(ws);
    expect(useWorkspaceStore.getState().workspaces.size).toBe(0);
  });

  it('setzt den aktiven Workspace', () => {
    const store = useWorkspaceStore.getState();

    store.setActiveWorkspace('ws1');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws1');
  });
});
