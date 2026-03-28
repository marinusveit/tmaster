import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalOutputController } from '@renderer/components/terminal/TerminalOutputController';
import type { TerminalProtectionState } from '@shared/types/terminal';

const realtimeProtection: TerminalProtectionState = {
  renderMode: 'realtime',
  isProtectionActive: false,
  outputBytesPerSecond: 0,
  pendingBufferBytes: 0,
  warning: null,
};

describe('TerminalOutputController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('schreibt direkt im Realtime-Modus', () => {
    const write = vi.fn();
    const controller = new TerminalOutputController(write, realtimeProtection);

    controller.push('abc');

    expect(write).toHaveBeenCalledWith('abc');
    controller.dispose();
  });

  it('bündelt Ausgabe im Throttle-Modus', () => {
    const write = vi.fn();
    const controller = new TerminalOutputController(write, {
      ...realtimeProtection,
      renderMode: 'throttled',
      isProtectionActive: true,
      warning: 'High-output protection active.',
    });

    controller.push('abc');
    controller.push('123');

    expect(write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(write).toHaveBeenCalledWith('abc123');
    controller.dispose();
  });

  it('flushes aufgestaute Daten sofort beim Wechsel zurueck auf Realtime', () => {
    const write = vi.fn();
    const controller = new TerminalOutputController(write, {
      ...realtimeProtection,
      renderMode: 'throttled',
      isProtectionActive: true,
      warning: 'High-output protection active.',
    });

    controller.push('abc');
    controller.setProtection(realtimeProtection);

    expect(write).toHaveBeenCalledWith('abc');
    controller.dispose();
  });
});
