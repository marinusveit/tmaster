import { TERMINAL_RENDER_THROTTLE_INTERVAL_MS } from '@shared/constants/defaults';
import type { TerminalProtectionState } from '@shared/types/terminal';

export class TerminalOutputController {
  private readonly queue: string[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private protection: TerminalProtectionState;

  public constructor(
    private readonly writeToTerminal: (data: string) => void,
    protection: TerminalProtectionState,
  ) {
    this.protection = protection;
  }

  public push(data: string): void {
    if (this.protection.renderMode === 'realtime' && this.queue.length === 0) {
      this.writeToTerminal(data);
      return;
    }

    this.queue.push(data);
    this.scheduleFlush();
  }

  public setProtection(protection: TerminalProtectionState): void {
    this.protection = protection;

    if (protection.renderMode === 'realtime') {
      this.flush();
      return;
    }

    if (this.queue.length > 0) {
      this.scheduleFlush();
    }
  }

  public flush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    const payload = this.queue.join('');
    this.queue.length = 0;
    this.writeToTerminal(payload);
  }

  public dispose(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    this.queue.length = 0;
  }

  private scheduleFlush(): void {
    if (this.flushTimeout) {
      return;
    }

    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = null;
      this.flush();

      if (this.protection.renderMode === 'throttled' && this.queue.length > 0) {
        this.scheduleFlush();
      }
    }, TERMINAL_RENDER_THROTTLE_INTERVAL_MS);
  }
}
