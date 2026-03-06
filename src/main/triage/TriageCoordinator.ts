import type { TerminalEvent } from '../../shared/types/event';
import type { TriageRequest, TriageResult, TriageTrigger } from '../../shared/types/triage';
import type { TriageService } from './TriageService';

const TRIAGE_COOLDOWN_MS = 60_000;
const AMBIGUOUS_KEYWORD_REGEX = /\b(plan|confirm|review|approve|proceed|accept|permission|allow|continue)\b/i;

export class TriageCoordinator {
  private readonly lastTriageCall: Map<string, number> = new Map();
  private readonly cooldownMs = TRIAGE_COOLDOWN_MS;
  private isDisposed = false;

  public constructor(
    private readonly triageService: TriageService,
    private readonly getRecentOutput: (terminalId: string, lines: number) => string,
    private readonly getTerminalMeta: (terminalId: string) => TriageRequest['terminalMeta'] | null,
    private readonly getAgentType: (terminalId: string) => string,
    private readonly onTriageResult: (terminalId: string, result: TriageResult) => void,
  ) {}

  public async onRegexCandidate(terminalId: string, matchedEvent: TerminalEvent): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    if (matchedEvent.source === 'exit_code' && matchedEvent.type === 'error') {
      return;
    }

    await this.runTriage(terminalId, 'regex_match');
  }

  public async onSilence(terminalId: string, trigger: TriageTrigger): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    if (trigger !== 'silence_timeout' && trigger !== 'output_burst') {
      return;
    }

    await this.runTriage(terminalId, trigger);
  }

  public async onOutputBurst(terminalId: string): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    const recentOutput = this.getRecentOutput(terminalId, 20);
    const trigger: TriageTrigger = AMBIGUOUS_KEYWORD_REGEX.test(recentOutput)
      ? 'ambiguous_keyword'
      : 'output_burst';

    await this.runTriage(terminalId, trigger);
  }

  public async onProcessExit(terminalId: string, exitCode: number): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    // Prozess-Exit wird immer sofort triagiert (ohne Cooldown),
    // damit Abschluss- oder Fehlerzustände nicht verzögert erkannt werden.
    const terminalMeta = this.getTerminalMeta(terminalId) ?? {
      status: 'exited',
      runtimeSeconds: 0,
      lastEventType: exitCode === 0 ? 'test_result' : 'error',
    };

    const request: TriageRequest = {
      terminalId,
      agentType: this.getNormalizedAgentType(terminalId),
      recentOutput: this.getRecentOutput(terminalId, 100),
      triggerReason: 'process_exit',
      terminalMeta,
    };

    const result = await this.triageService.analyze(request);
    if (result && !this.isDisposed) {
      this.onTriageResult(terminalId, result);
    }
  }

  public async checkAmbiguousKeywords(terminalId: string): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    const recentOutput = this.getRecentOutput(terminalId, 20);
    if (!AMBIGUOUS_KEYWORD_REGEX.test(recentOutput)) {
      return;
    }

    await this.runTriage(terminalId, 'ambiguous_keyword');
  }

  public dispose(): void {
    this.isDisposed = true;
    this.lastTriageCall.clear();
  }

  private async runTriage(terminalId: string, triggerReason: TriageTrigger): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    if (!this.canRunTriage(terminalId)) {
      return;
    }

    const terminalMeta = this.getTerminalMeta(terminalId);
    if (!terminalMeta) {
      return;
    }

    this.lastTriageCall.set(terminalId, Date.now());

    const request: TriageRequest = {
      terminalId,
      agentType: this.getNormalizedAgentType(terminalId),
      recentOutput: this.getRecentOutput(terminalId, 100),
      triggerReason,
      terminalMeta,
    };

    const result = await this.triageService.analyze(request);
    if (result && !this.isDisposed) {
      this.onTriageResult(terminalId, result);
    }
  }

  private canRunTriage(terminalId: string): boolean {
    const lastCall = this.lastTriageCall.get(terminalId);
    if (lastCall === undefined) {
      return true;
    }

    return Date.now() - lastCall >= this.cooldownMs;
  }

  private getNormalizedAgentType(terminalId: string): string {
    const agentType = this.getAgentType(terminalId).trim();
    if (agentType.length === 0) {
      return 'generic';
    }

    return agentType;
  }
}
