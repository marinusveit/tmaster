import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SilenceMonitor } from '@main/triage/SilenceMonitor';

describe('SilenceMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() beginnt periodische Silence-Checks', () => {
    const onSilenceDetected = vi.fn();
    const monitor = new SilenceMonitor(onSilenceDetected, vi.fn(), () => true);

    monitor.onOutput('t1');
    monitor.start();

    vi.advanceTimersByTime(100_000);
    expect(onSilenceDetected).toHaveBeenCalledWith('t1', 'silence_timeout');
  });

  it('onOutput() aktualisiert den letzten Output-Timestamp', () => {
    const onSilenceDetected = vi.fn();
    const monitor = new SilenceMonitor(onSilenceDetected, vi.fn(), () => true);

    monitor.onOutput('t1');
    monitor.start();

    vi.advanceTimersByTime(80_000);
    monitor.onOutput('t1');
    vi.advanceTimersByTime(80_000);

    expect(onSilenceDetected).not.toHaveBeenCalled();
  });

  it('triggert silence_timeout bei Stille >90s fuer aktive Terminals', () => {
    const onSilenceDetected = vi.fn();
    const monitor = new SilenceMonitor(onSilenceDetected, vi.fn(), () => true);

    monitor.onOutput('t1');
    monitor.start();

    vi.advanceTimersByTime(100_000);
    expect(onSilenceDetected).toHaveBeenCalledTimes(1);
    expect(onSilenceDetected).toHaveBeenCalledWith('t1', 'silence_timeout');
  });

  it('triggert nicht bei inaktiven Terminals', () => {
    const onSilenceDetected = vi.fn();
    const monitor = new SilenceMonitor(onSilenceDetected, vi.fn(), () => false);

    monitor.onOutput('t1');
    monitor.start();

    vi.advanceTimersByTime(120_000);
    expect(onSilenceDetected).not.toHaveBeenCalled();
  });

  it('triggert output_burst wenn nach Silence wieder Output kommt', () => {
    const onOutputBurst = vi.fn();
    const monitor = new SilenceMonitor(vi.fn(), onOutputBurst, () => true);

    monitor.onOutput('t1');
    monitor.start();
    vi.advanceTimersByTime(100_000);

    monitor.onOutput('t1');
    expect(onOutputBurst).toHaveBeenCalledTimes(1);
    expect(onOutputBurst).toHaveBeenCalledWith('t1', 'output_burst');
  });

  it('erlaubt erneute silence_timeout-Erkennung nach Output-Burst', () => {
    const onSilenceDetected = vi.fn();
    const monitor = new SilenceMonitor(onSilenceDetected, vi.fn(), () => true);

    monitor.onOutput('t1');
    monitor.start();
    vi.advanceTimersByTime(100_000);
    monitor.onOutput('t1');
    vi.advanceTimersByTime(100_000);

    expect(onSilenceDetected).toHaveBeenCalledTimes(2);
  });

  it('verhindert Doppel-Trigger innerhalb derselben Silence-Phase', () => {
    const onSilenceDetected = vi.fn();
    const monitor = new SilenceMonitor(onSilenceDetected, vi.fn(), () => true);

    monitor.onOutput('t1');
    monitor.start();
    vi.advanceTimersByTime(100_000);
    vi.advanceTimersByTime(200_000);

    expect(onSilenceDetected).toHaveBeenCalledTimes(1);
  });

  it('removeTerminal() raeumt Terminal-Zustand auf', () => {
    const onSilenceDetected = vi.fn();
    const monitor = new SilenceMonitor(onSilenceDetected, vi.fn(), () => true);

    monitor.onOutput('t1');
    monitor.removeTerminal('t1');
    monitor.start();

    vi.advanceTimersByTime(120_000);
    expect(onSilenceDetected).not.toHaveBeenCalled();
  });

  it('dispose() stoppt das Interval', () => {
    const onSilenceDetected = vi.fn();
    const monitor = new SilenceMonitor(onSilenceDetected, vi.fn(), () => true);

    monitor.onOutput('t1');
    monitor.start();
    monitor.dispose();
    vi.advanceTimersByTime(120_000);

    expect(onSilenceDetected).not.toHaveBeenCalled();
  });
});
