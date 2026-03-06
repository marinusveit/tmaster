import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalEvent } from '@shared/types/event';
import type { TriageRequest, TriageResult } from '@shared/types/triage';
import { TriageCoordinator } from '@main/triage/TriageCoordinator';
import type { TriageService } from '@main/triage/TriageService';

const DEFAULT_RESULT: TriageResult = {
  status: 'working',
  summary: 'Still processing',
  urgency: 'low',
  escalate: false,
};

const createEvent = (terminalId: string): TerminalEvent => {
  return {
    terminalId,
    timestamp: Date.now(),
    type: 'warning',
    summary: 'Potential prompt detected',
    source: 'pattern',
  };
};

const createCoordinator = (options?: {
  getRecentOutput?: (terminalId: string, lines: number) => string;
  getTerminalMeta?: (terminalId: string) => TriageRequest['terminalMeta'] | null;
  getAgentType?: (terminalId: string) => string;
}) => {
  const analyze = vi.fn<[TriageRequest], Promise<TriageResult | null>>();
  const triageService = { analyze } as unknown as TriageService;
  const onTriageResult = vi.fn();

  const coordinator = new TriageCoordinator(
    triageService,
    options?.getRecentOutput ?? (() => 'recent output'),
    options?.getTerminalMeta ?? (() => ({
      status: 'active',
      runtimeSeconds: 42,
      lastEventType: 'warning',
    })),
    options?.getAgentType ?? (() => 'claude'),
    onTriageResult,
  );

  return { coordinator, analyze, onTriageResult };
};

describe('TriageCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T11:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('onRegexCandidate() ruft TriageService.analyze() auf', async () => {
    const { coordinator, analyze } = createCoordinator();
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.onRegexCandidate('t1', createEvent('t1'));

    expect(analyze).toHaveBeenCalledTimes(1);
    const request = analyze.mock.calls[0]?.[0];
    expect(request?.triggerReason).toBe('regex_match');
  });

  it('onSilence() ruft TriageService.analyze() auf', async () => {
    const { coordinator, analyze } = createCoordinator();
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.onSilence('t1', 'silence_timeout');

    expect(analyze).toHaveBeenCalledTimes(1);
    const request = analyze.mock.calls[0]?.[0];
    expect(request?.triggerReason).toBe('silence_timeout');
  });

  it('onOutputBurst() priorisiert ambiguous_keyword wenn Keywords enthalten sind', async () => {
    const { coordinator, analyze } = createCoordinator({
      getRecentOutput: () => 'Please review and confirm before proceeding.',
    });
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.onOutputBurst('t1');

    expect(analyze).toHaveBeenCalledTimes(1);
    const request = analyze.mock.calls[0]?.[0];
    expect(request?.triggerReason).toBe('ambiguous_keyword');
  });

  it('onOutputBurst() nutzt output_burst ohne ambigue Keywords', async () => {
    const { coordinator, analyze } = createCoordinator({
      getRecentOutput: () => 'Compilation finished successfully.',
    });
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.onOutputBurst('t1');

    expect(analyze).toHaveBeenCalledTimes(1);
    const request = analyze.mock.calls[0]?.[0];
    expect(request?.triggerReason).toBe('output_burst');
  });

  it('Cooldown ueberspringt zweiten Call innerhalb von 60s fuer dasselbe Terminal', async () => {
    const { coordinator, analyze } = createCoordinator();
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.onSilence('t1', 'silence_timeout');
    await coordinator.onSilence('t1', 'output_burst');

    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('Cooldown blockiert keine Calls fuer unterschiedliche Terminals', async () => {
    const { coordinator, analyze } = createCoordinator();
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.onSilence('t1', 'silence_timeout');
    await coordinator.onSilence('t2', 'silence_timeout');

    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it('onTriageResult callback wird mit Ergebnis aufgerufen', async () => {
    const result: TriageResult = {
      status: 'action_required',
      summary: 'Need approval',
      detail: 'Please approve this plan',
      urgency: 'high',
      escalate: true,
    };
    const { coordinator, analyze, onTriageResult } = createCoordinator();
    analyze.mockResolvedValue(result);

    await coordinator.onRegexCandidate('t1', createEvent('t1'));

    expect(onTriageResult).toHaveBeenCalledWith('t1', result);
  });

  it('kein onTriageResult Aufruf wenn analyze() null liefert', async () => {
    const { coordinator, analyze, onTriageResult } = createCoordinator();
    analyze.mockResolvedValue(null);

    await coordinator.onRegexCandidate('t1', createEvent('t1'));

    expect(onTriageResult).not.toHaveBeenCalled();
  });

  it('onProcessExit() ruft analyze() mit triggerReason process_exit auf', async () => {
    const { coordinator, analyze } = createCoordinator({
      getTerminalMeta: () => null,
    });
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.onProcessExit('t1', 1);

    expect(analyze).toHaveBeenCalledTimes(1);
    const request = analyze.mock.calls[0]?.[0];
    expect(request?.triggerReason).toBe('process_exit');
  });

  it('onProcessExit() ignoriert Cooldown', async () => {
    const { coordinator, analyze } = createCoordinator();
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.onSilence('t1', 'silence_timeout');
    await coordinator.onProcessExit('t1', 0);

    expect(analyze).toHaveBeenCalledTimes(2);
    const secondRequest = analyze.mock.calls[1]?.[0];
    expect(secondRequest?.triggerReason).toBe('process_exit');
  });

  it('checkAmbiguousKeywords() triggert analyze() bei Keywords in letzten Zeilen', async () => {
    const { coordinator, analyze } = createCoordinator({
      getRecentOutput: () => 'Could you review and confirm this plan?',
    });
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.checkAmbiguousKeywords('t1');

    expect(analyze).toHaveBeenCalledTimes(1);
    const request = analyze.mock.calls[0]?.[0];
    expect(request?.triggerReason).toBe('ambiguous_keyword');
  });

  it('checkAmbiguousKeywords() triggert nicht ohne Keywords', async () => {
    const { coordinator, analyze } = createCoordinator({
      getRecentOutput: () => 'Build step finished without prompts.',
    });
    analyze.mockResolvedValue(DEFAULT_RESULT);

    await coordinator.checkAmbiguousKeywords('t1');

    expect(analyze).not.toHaveBeenCalled();
  });

  it('liefert nach dispose() kein Ergebnis mehr fuer laufende Triage', async () => {
    const { coordinator, analyze, onTriageResult } = createCoordinator();
    let resolveAnalyze: ((value: TriageResult | null) => void) | null = null;

    analyze.mockImplementation(() => {
      return new Promise<TriageResult | null>((resolve) => {
        resolveAnalyze = resolve;
      });
    });

    const processExitPromise = coordinator.onProcessExit('t1', 1);
    coordinator.dispose();
    resolveAnalyze?.(DEFAULT_RESULT);
    await processExitPromise;

    expect(onTriageResult).not.toHaveBeenCalled();
  });
});
