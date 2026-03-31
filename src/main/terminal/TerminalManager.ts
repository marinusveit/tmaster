import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';
import {
  DEFAULT_TERMINAL_SCROLLBACK,
  TERMINAL_PROTECTION_THRESHOLD_BYTES_PER_SECOND,
} from '../../shared/types/terminal';
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  ReorderTerminalsRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalId,
  TerminalLabel,
  TerminalProtectionEvent,
  TerminalProtectionReason,
  TerminalProtectionState,
  TerminalSessionInfo,
} from '../../shared/types/terminal';
import type { WorkspaceId } from '../../shared/types/workspace';
import { MAX_TERMINALS, TERMINAL_LABEL_PREFIX } from '../../shared/constants/defaults';

interface OutputRateBucket {
  bucketStart: number;
  bytes: number;
}

interface TerminalSession {
  pty: IPty;
  dataDisposable: { dispose: () => void };
  label: TerminalLabel;
  workspaceId: WorkspaceId;
  displayOrder: number;
  status: 'active' | 'idle' | 'exited';
  createdAt: number;
  lastActivity: number;
  lastFlushAt: number;
  scrollback: number;
  protection: TerminalProtectionState;
  outputRateBuckets: OutputRateBucket[];
}

interface TerminalManagerCallbacks {
  onData: (event: TerminalDataEvent) => void;
  onExit: (event: TerminalExitEvent) => void;
  onStatusChange?: (terminalId: TerminalId, status: 'active' | 'idle' | 'exited') => void;
  onProtectionChange?: (event: TerminalProtectionEvent) => void;
}

export class TerminalManager {
  private static readonly DEFAULT_WORKSPACE_ID = 'default';
  private static readonly OUTPUT_RATE_BUCKET_MS = 100;
  private static readonly OUTPUT_RATE_WINDOW_MS = 1000;
  private static readonly THROTTLED_FLUSH_INTERVAL_MS = 64;
  private static readonly NORMAL_FLUSH_INTERVAL_MS = 16;
  private static readonly THROTTLE_RECOVERY_BYTES_PER_SECOND = 768 * 1024;
  private static readonly BUFFER_PRESSURE_WARNING_BYTES = 256 * 1024;

  private readonly sessions = new Map<TerminalId, TerminalSession>();
  private readonly buffers = new Map<TerminalId, string[]>();
  private readonly flushInterval: NodeJS.Timeout;
  private readonly labelCounters = new Map<WorkspaceId, number>();
  private isDisposed = false;

  public constructor(private readonly callbacks: TerminalManagerCallbacks) {
    // 16ms Batching zum Schutz der Renderer-Event-Queue.
    this.flushInterval = setInterval(() => {
      this.flushBuffers();
    }, TerminalManager.NORMAL_FLUSH_INTERVAL_MS);
  }

  /**
   * Setzt den Label-Counter für einen Workspace (z.B. aus DB beim Start).
   */
  public setLabelCounter(workspaceId: WorkspaceId, nextIndex: number): void {
    this.labelCounters.set(workspaceId, nextIndex);
  }

  private getNextLabel(workspaceId: WorkspaceId): TerminalLabel {
    const current = this.labelCounters.get(workspaceId) ?? 1;
    this.labelCounters.set(workspaceId, current + 1);
    return { prefix: TERMINAL_LABEL_PREFIX, index: current };
  }

  private getNextDisplayOrder(workspaceId: WorkspaceId): number {
    let maxDisplayOrder = 0;
    for (const session of this.sessions.values()) {
      if (session.workspaceId === workspaceId) {
        maxDisplayOrder = Math.max(maxDisplayOrder, session.displayOrder);
      }
    }

    return maxDisplayOrder + 1;
  }

  public createTerminal(request: CreateTerminalRequest): CreateTerminalResponse {
    if (this.isDisposed) {
      throw new Error('TerminalManager has been disposed');
    }

    if (this.sessions.size >= MAX_TERMINALS) {
      throw new Error(`Terminal limit reached (max ${MAX_TERMINALS})`);
    }

    const terminalId = randomUUID();
    const workspaceId = request.workspaceId ?? TerminalManager.DEFAULT_WORKSPACE_ID;
    const label = this.getNextLabel(workspaceId);
    const displayOrder = this.getNextDisplayOrder(workspaceId);
    const shell = request.shell ?? this.getDefaultShell();
    const scrollback = this.resolveScrollback(request.scrollback);
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: request.cwd ?? process.cwd(),
      env: this.buildEnvironment(),
    });

    this.buffers.set(terminalId, []);

    // onData-Disposable speichern damit wir den Listener in onExit aufräumen können.
    // Verhindert, dass node-pty's nativer Read-Thread nach dem Prozess-Exit
    // in einen stale JS-Callback schreibt (SIGSEGV).
    const dataDisposable = pty.onData((data) => {
      const chunks = this.buffers.get(terminalId);
      const currentSession = this.sessions.get(terminalId);
      if (!chunks || !currentSession) {
        return;
      }

      const now = Date.now();
      const chunkBytes = Buffer.byteLength(data, 'utf8');

      chunks.push(data);
      currentSession.lastActivity = now;
      this.recordOutputSample(currentSession, chunkBytes, now);
      this.updateProtectionState(terminalId, currentSession, now);
    });

    const session: TerminalSession = {
      pty,
      dataDisposable,
      label,
      workspaceId,
      displayOrder,
      status: 'active',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      lastFlushAt: 0,
      scrollback,
      protection: this.createDefaultProtectionState(),
      outputRateBuckets: [],
    };
    this.sessions.set(terminalId, session);

    pty.onExit(({ exitCode, signal }) => {
      // Sofort onData-Listener entfernen bevor weitere Events ankommen
      dataDisposable.dispose();

      const exitedSession = this.sessions.get(terminalId);
      if (exitedSession) {
        exitedSession.status = 'exited';
        this.callbacks.onStatusChange?.(terminalId, 'exited');
      }

      // Restliche Daten im Buffer noch flushen
      const remainingChunks = this.buffers.get(terminalId);
      if (remainingChunks && remainingChunks.length > 0) {
        this.callbacks.onData({ terminalId, data: remainingChunks.join('') });
      }

      this.buffers.delete(terminalId);
      this.sessions.delete(terminalId);
      this.callbacks.onExit({ terminalId, exitCode, signal });
    });

    return {
      terminalId,
      label,
      workspaceId,
      displayOrder,
      scrollback,
      protection: { ...session.protection },
    };
  }

  public writeTerminal(terminalId: TerminalId, data: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }

    session.lastActivity = Date.now();
    session.pty.write(data);
  }

  public sendInput(terminalId: TerminalId, input: string): void {
    const normalizedInput = input.replace(/\r\n/g, '\n');
    const submittedInput = normalizedInput.endsWith('\n') ? normalizedInput : `${normalizedInput}\n`;
    this.writeTerminal(terminalId, submittedInput);
  }

  public resizeTerminal(terminalId: TerminalId, cols: number, rows: number): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }

    session.pty.resize(cols, rows);
  }

  public closeTerminal(terminalId: TerminalId): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }

    session.dataDisposable.dispose();
    session.pty.kill();
    this.sessions.delete(terminalId);
    this.buffers.delete(terminalId);
  }

  public reorderTerminals(request: ReorderTerminalsRequest): void {
    const workspaceTerminals = [...this.sessions.entries()]
      .filter(([, session]) => session.workspaceId === request.workspaceId);
    const workspaceTerminalIds = workspaceTerminals.map(([terminalId]) => terminalId);
    const expectedIds = new Set(workspaceTerminalIds);
    const receivedIds = new Set(request.orderedTerminalIds);

    if (
      workspaceTerminalIds.length !== request.orderedTerminalIds.length
      || workspaceTerminalIds.some((terminalId) => !receivedIds.has(terminalId))
      || request.orderedTerminalIds.some((terminalId) => !expectedIds.has(terminalId))
    ) {
      throw new Error('Invalid reorder payload');
    }

    request.orderedTerminalIds.forEach((terminalId, index) => {
      const session = this.sessions.get(terminalId);
      if (session) {
        session.displayOrder = index + 1;
      }
    });
  }

  public listTerminals(): TerminalSessionInfo[] {
    return [...this.sessions.entries()].map(([terminalId, session]) => ({
      terminalId,
      label: session.label,
      workspaceId: session.workspaceId,
      displayOrder: session.displayOrder,
      status: session.status,
      createdAt: session.createdAt,
      scrollback: session.scrollback,
      protection: { ...session.protection },
    }));
  }

  public getTerminalsByWorkspace(workspaceId: WorkspaceId): TerminalSessionInfo[] {
    return this.listTerminals().filter((t) => t.workspaceId === workspaceId);
  }

  public getSessions(): Map<TerminalId, TerminalSessionInfo & { lastActivity: number }> {
    const terminalSessions = new Map<TerminalId, TerminalSessionInfo & { lastActivity: number }>();
    for (const [terminalId, session] of this.sessions) {
      terminalSessions.set(terminalId, {
        terminalId,
        label: session.label,
        workspaceId: session.workspaceId,
        displayOrder: session.displayOrder,
        status: session.status,
        createdAt: session.createdAt,
        scrollback: session.scrollback,
        protection: { ...session.protection },
        lastActivity: session.lastActivity,
      });
    }

    return terminalSessions;
  }

  public getSession(terminalId: TerminalId): (TerminalSessionInfo & { lastActivity: number }) | null {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return null;
    }

    return {
      terminalId,
      label: session.label,
      workspaceId: session.workspaceId,
      displayOrder: session.displayOrder,
      status: session.status,
      createdAt: session.createdAt,
      scrollback: session.scrollback,
      protection: { ...session.protection },
      lastActivity: session.lastActivity,
    };
  }

  public getSessionCount(): number {
    return this.sessions.size;
  }

  public destroyAll(): void {
    // Letzte Buffers flushen bevor Sessions geschlossen werden
    this.flushBuffers();

    // Array.from() um ConcurrentModification zu vermeiden
    for (const terminalId of Array.from(this.sessions.keys())) {
      this.closeTerminal(terminalId);
    }
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.destroyAll();
    clearInterval(this.flushInterval);
    this.isDisposed = true;
  }

  private flushBuffers(): void {
    const now = Date.now();

    for (const [terminalId, chunks] of this.buffers) {
      if (chunks.length === 0) {
        continue;
      }

      const session = this.sessions.get(terminalId);
      if (!session) {
        continue;
      }

      const flushInterval = session.protection.mode === 'throttled'
        ? TerminalManager.THROTTLED_FLUSH_INTERVAL_MS
        : TerminalManager.NORMAL_FLUSH_INTERVAL_MS;

      if (session.lastFlushAt !== 0 && now - session.lastFlushAt < flushInterval) {
        continue;
      }

      const data = chunks.join('');
      chunks.length = 0;
      session.lastFlushAt = now;
      this.updateProtectionState(terminalId, session, now, 0);
      this.callbacks.onData({ terminalId, data });
    }

    for (const [terminalId, session] of this.sessions) {
      const chunks = this.buffers.get(terminalId);
      if (chunks && chunks.length > 0) {
        continue;
      }

      this.updateProtectionState(terminalId, session, now);
    }
  }

  private getDefaultShell(): string {
    if (os.platform() === 'win32') {
      return process.env.COMSPEC ?? 'cmd.exe';
    }

    return process.env.SHELL ?? '/bin/bash';
  }

  // Env-Variablen die von übergeordneten CLI-Sessions stammen und in Child-PTYs nicht vererbt werden sollen.
  private static readonly STRIPPED_ENV_VARS = new Set([
    'CLAUDECODE',
  ]);

  private buildEnvironment(): Record<string, string> {
    const entries = Object.entries(process.env).filter(
      ([key, value]) => typeof value === 'string' && !TerminalManager.STRIPPED_ENV_VARS.has(key),
    );
    return Object.fromEntries(entries) as Record<string, string>;
  }

  private resolveScrollback(scrollback: number | undefined): number {
    if (scrollback === undefined) {
      return DEFAULT_TERMINAL_SCROLLBACK;
    }

    if (!Number.isInteger(scrollback) || scrollback < 1) {
      throw new Error('Invalid scrollback value');
    }

    return scrollback;
  }

  private createDefaultProtectionState(): TerminalProtectionState {
    return {
      mode: 'normal',
      reason: 'none',
      outputBytesPerSecond: 0,
      bufferedBytes: 0,
      thresholdBytesPerSecond: TERMINAL_PROTECTION_THRESHOLD_BYTES_PER_SECOND,
      warning: null,
      updatedAt: Date.now(),
    };
  }

  private recordOutputSample(session: TerminalSession, bytes: number, now: number): void {
    const bucketStart = now - (now % TerminalManager.OUTPUT_RATE_BUCKET_MS);
    const lastBucket = session.outputRateBuckets.at(-1);

    if (lastBucket && lastBucket.bucketStart === bucketStart) {
      lastBucket.bytes += bytes;
    } else {
      session.outputRateBuckets.push({ bucketStart, bytes });
    }

    session.protection.bufferedBytes += bytes;
    this.pruneOutputRateBuckets(session, now);
  }

  private pruneOutputRateBuckets(session: TerminalSession, now: number): void {
    const oldestBucketStart = now - TerminalManager.OUTPUT_RATE_WINDOW_MS;
    while (session.outputRateBuckets[0] && session.outputRateBuckets[0].bucketStart < oldestBucketStart) {
      session.outputRateBuckets.shift();
    }
  }

  private getOutputBytesPerSecond(session: TerminalSession, now: number): number {
    this.pruneOutputRateBuckets(session, now);
    return session.outputRateBuckets.reduce((sum, bucket) => sum + bucket.bytes, 0);
  }

  private buildProtectionState(
    session: TerminalSession,
    now: number,
    bufferedBytes = session.protection.bufferedBytes,
  ): TerminalProtectionState {
    const outputBytesPerSecond = this.getOutputBytesPerSecond(session, now);
    const shouldThrottle = session.protection.mode === 'throttled'
      ? outputBytesPerSecond >= TerminalManager.THROTTLE_RECOVERY_BYTES_PER_SECOND
      : outputBytesPerSecond >= TERMINAL_PROTECTION_THRESHOLD_BYTES_PER_SECOND;
    const hasBufferPressure = bufferedBytes >= TerminalManager.BUFFER_PRESSURE_WARNING_BYTES;
    const reason: TerminalProtectionReason = shouldThrottle
      ? 'output-rate'
      : hasBufferPressure
        ? 'buffer-pressure'
        : 'none';

    let warning: string | null = null;
    if (reason === 'output-rate') {
      warning = 'High output detected. Rendering is throttled for this terminal to protect responsiveness.';
    } else if (reason === 'buffer-pressure') {
      warning = 'Terminal output is building up quickly. Buffering remains limited to protect memory.';
    }

    return {
      mode: shouldThrottle ? 'throttled' : 'normal',
      reason,
      outputBytesPerSecond,
      bufferedBytes,
      thresholdBytesPerSecond: TERMINAL_PROTECTION_THRESHOLD_BYTES_PER_SECOND,
      warning,
      updatedAt: now,
    };
  }

  private updateProtectionState(
    terminalId: TerminalId,
    session: TerminalSession,
    now: number,
    bufferedBytes = session.protection.bufferedBytes,
  ): void {
    const nextProtection = this.buildProtectionState(session, now, bufferedBytes);
    const shouldEmit = !this.isProtectionStateEquivalent(session.protection, nextProtection);
    session.protection = nextProtection;

    if (!shouldEmit) {
      return;
    }

    this.callbacks.onProtectionChange?.({
      terminalId,
      protection: { ...session.protection },
    });
  }

  private isProtectionStateEquivalent(
    left: TerminalProtectionState,
    right: TerminalProtectionState,
  ): boolean {
    return left.mode === right.mode
      && left.reason === right.reason
      && left.warning === right.warning;
  }
}
