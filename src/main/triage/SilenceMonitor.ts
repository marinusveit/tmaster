type SilenceTrigger = 'silence_timeout';
type OutputBurstTrigger = 'output_burst';

export class SilenceMonitor {
  private readonly lastOutput: Map<string, number> = new Map();
  private readonly alreadyTriggered: Map<string, boolean> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private readonly silenceThresholdMs = 90_000;
  private readonly checkIntervalMs = 10_000;

  public constructor(
    private readonly onSilenceDetected: (terminalId: string, trigger: SilenceTrigger) => void,
    private readonly onOutputBurst: (terminalId: string, trigger: OutputBurstTrigger) => void,
    private readonly isTerminalActive: (terminalId: string) => boolean,
  ) {}

  public start(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkSilence();
    }, this.checkIntervalMs);
  }

  public stop(): void {
    if (!this.checkInterval) {
      return;
    }

    clearInterval(this.checkInterval);
    this.checkInterval = null;
  }

  public onOutput(terminalId: string): void {
    const hadTriggeredSilence = this.alreadyTriggered.get(terminalId) === true;
    this.lastOutput.set(terminalId, Date.now());
    this.alreadyTriggered.set(terminalId, false);

    if (hadTriggeredSilence) {
      this.onOutputBurst(terminalId, 'output_burst');
    }
  }

  public removeTerminal(terminalId: string): void {
    this.lastOutput.delete(terminalId);
    this.alreadyTriggered.delete(terminalId);
  }

  public dispose(): void {
    this.stop();
    this.lastOutput.clear();
    this.alreadyTriggered.clear();
  }

  private checkSilence(): void {
    const now = Date.now();

    for (const [terminalId, lastOutputTimestamp] of this.lastOutput.entries()) {
      if (!this.isTerminalActive(terminalId)) {
        continue;
      }

      if (this.alreadyTriggered.get(terminalId) === true) {
        continue;
      }

      if (now - lastOutputTimestamp <= this.silenceThresholdMs) {
        continue;
      }

      this.alreadyTriggered.set(terminalId, true);
      this.onSilenceDetected(terminalId, 'silence_timeout');
    }
  }
}
