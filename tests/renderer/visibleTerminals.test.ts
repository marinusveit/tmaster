import { describe, expect, it } from 'vitest';
import { getVisibleTerminals } from '@renderer/components/terminal/visibleTerminals';
import type { TerminalSessionInfo } from '@shared/types/terminal';

const makeTerminal = (index: number): TerminalSessionInfo => ({
  terminalId: `t${index}`,
  label: { prefix: 'T', index },
  workspaceId: 'ws-1',
  status: 'active',
  createdAt: index,
  scrollback: 5000,
  protection: {
    mode: 'normal',
    reason: 'none',
    outputBytesPerSecond: 0,
    bufferedBytes: 0,
    thresholdBytesPerSecond: 1024 * 1024,
    warning: null,
    updatedAt: 0,
  },
});

describe('getVisibleTerminals', () => {
  it('zeigt im Single-Mode das aktive Terminal', () => {
    const terminals = [makeTerminal(1), makeTerminal(2), makeTerminal(3)];

    const visible = getVisibleTerminals(terminals, 't2', 'single');

    expect(visible.map((terminal) => terminal.terminalId)).toEqual(['t2']);
  });

  it('waehlt im Split ein Fenster, das das aktive Terminal enthaelt', () => {
    const terminals = [makeTerminal(1), makeTerminal(2), makeTerminal(3), makeTerminal(4), makeTerminal(5)];

    const visible = getVisibleTerminals(terminals, 't5', 'horizontal');

    expect(visible.map((terminal) => terminal.terminalId)).toEqual(['t4', 't5']);
  });

  it('faellt ohne aktives Terminal auf die ersten sichtbaren Slots zurueck', () => {
    const terminals = [makeTerminal(1), makeTerminal(2), makeTerminal(3), makeTerminal(4), makeTerminal(5)];

    const visible = getVisibleTerminals(terminals, null, 'grid');

    expect(visible.map((terminal) => terminal.terminalId)).toEqual(['t1', 't2', 't3', 't4']);
  });
});
