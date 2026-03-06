import { beforeEach, describe, expect, it } from 'vitest';
import { useQuickSwitcherStore } from '@renderer/stores/quickSwitcherStore';

describe('quickSwitcherStore', () => {
  beforeEach(() => {
    useQuickSwitcherStore.setState({
      isOpen: false,
      query: '',
      selectedIndex: 0,
    });
  });

  it('open() setzt isOpen auf true', () => {
    useQuickSwitcherStore.getState().open();

    expect(useQuickSwitcherStore.getState().isOpen).toBe(true);
  });

  it('close() setzt isOpen auf false und resettet query + selectedIndex', () => {
    const store = useQuickSwitcherStore.getState();
    store.open();
    store.setQuery('codex');
    store.moveDown();

    store.close();

    const next = useQuickSwitcherStore.getState();
    expect(next.isOpen).toBe(false);
    expect(next.query).toBe('');
    expect(next.selectedIndex).toBe(0);
  });

  it('setQuery() aktualisiert query und resettet selectedIndex auf 0', () => {
    const store = useQuickSwitcherStore.getState();
    store.moveDown();
    store.moveDown();

    store.setQuery('terminal');

    const next = useQuickSwitcherStore.getState();
    expect(next.query).toBe('terminal');
    expect(next.selectedIndex).toBe(0);
  });

  it('moveDown() incrementiert selectedIndex', () => {
    const store = useQuickSwitcherStore.getState();

    store.moveDown();

    expect(useQuickSwitcherStore.getState().selectedIndex).toBe(1);
  });

  it('moveUp() decrementiert selectedIndex und geht nicht unter 0', () => {
    const store = useQuickSwitcherStore.getState();

    store.moveDown();
    store.moveDown();
    store.moveUp();

    expect(useQuickSwitcherStore.getState().selectedIndex).toBe(1);

    store.moveUp();
    store.moveUp();

    expect(useQuickSwitcherStore.getState().selectedIndex).toBe(0);
  });
});
