import { describe, expect, it } from 'vitest';
import { getDropPosition, reorderTerminalIds } from '@renderer/components/terminal/terminalTabDrag';

describe('terminalTabDrag', () => {
  it('erkennt Drop vor der linken Tab-Haelfte', () => {
    expect(getDropPosition(20, { left: 0, width: 100 } as DOMRect)).toBe('before');
  });

  it('erkennt Drop hinter der rechten Tab-Haelfte', () => {
    expect(getDropPosition(80, { left: 0, width: 100 } as DOMRect)).toBe('after');
  });

  it('ordnet eine Tab-ID vor das Ziel um', () => {
    expect(reorderTerminalIds(['t1', 't2', 't3'], 't3', 't1', 'before')).toEqual(['t3', 't1', 't2']);
  });

  it('ordnet eine Tab-ID hinter das Ziel um', () => {
    expect(reorderTerminalIds(['t1', 't2', 't3'], 't1', 't3', 'after')).toEqual(['t2', 't3', 't1']);
  });
});
