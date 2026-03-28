import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalId,
  TerminalLabel,
  TerminalProtectionEvent,
  TerminalProtectionState,
  TerminalSessionInfo,
} from '../../shared/types/terminal';
import type { WorkspaceId } from '../../shared/types/workspace';
import {
  DEFAULT_TERMINAL_SCROLLBACK,
  MAX_TERMINALS,
  MAX_TERMINAL_SCROLLBACK,
  MIN_TERMINAL_SCROLLBACK,
  TERMINAL_LABEL_PREFIX,
  TERMINAL_OUTPUT_RECOVERY_BYTES_PER_SECOND,
  TERMINAL_OUTPUT_SAMPLE_WINDOW_MS,
  TERMINAL_OUTPUT_THROTTLE_BYTES_PER_SECOND,
  TERMINAL_PENDING_BUFFER_WARNING_BYTES,
  TERMINAL_PROTECTION_WARNING_COOLDOWN_MS,
} from '../../shared/constants/defaults';

interface OutputSample {
  timestamp: number;
  bytes: number;
}

interface TerminalSession {
  pty: IPty;
  dataDisposable: { dispose: () => void };
  label: TerminalLabel;
  workspaceId: WorkspaceId;
  status: 'active' | 'idle' | 'exited';
  createdAt: number;
  lastActivity: number;
  scrollback: number;
  protection: TerminalProtectionState;
  pendingBufferBytes: number;
  recentOutput: OutputSample[];
  recentOutputBytes: number;
  lastProtectionWarningAt: number;
}

interface TerminalManagerCallbacks {
  onData: (event: TerminalDataEvent) => void;
  onExit: (event: TerminalExitEvent) => void;
  onStatusChange?: (terminalId: TerminalId, status: 'active' | 'idle' | 'exited') => void;
  onProtectionChange?: (event: TerminalProtectionEvent) => void;
  onProtectionWarning?: (event: TerminalProtectionEvent) => void;
}

export class TerminalManager {
  private readonly sessions = new Map<TerminalId, TerminalSession>();
  private readonly buffers = new Map<TerminalId, string[]>();
  private readonly flushInterval: NodeJS.Timeout;
  private readonly labelCounters = new Map<WorkspaceId, number>();
  private isDisposed = false;
  private static readonly DEFAULT_WORKSPACE_ID = 'default';
  private static readonly DEFAULT_PROTECTION_STATE: TerminalProtectionState = {
    renderMode: 'realtime',
    isProtectionActive: false,
    outputBytesPerSecond: 0,
    pendingBufferBytes: 0,
    warning: null,
  };

  public constructor(private readonly callbacks: TerminalManagerCallbacks) {
    // 16ms Batching zum Schutz der Renderer-Event-Queue.
    this.flushInterval = setInterval(() => {
      this.flushBuffers();
    }, 16);
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
    const shell = request.shell ?? this.getDefaultShell();
    const scrollback = this.normalizeScrollback(request.scrollback);
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
      if (!chunks) {
        return;
      }
      const dataBytes = Buffer.byteLength(data, 'utf8');
      chunks.push(data);
      const currentSession = this.sessions.get(terminalId);
      if (currentSession) {
        currentSession.lastActivity = Date.now();
        currentSession.pendingBufferBytes += dataBytes;
        this.recordOutputSample(currentSession, currentSession.lastActivity, dataBytes);
        this.recalculateProtectionState(terminalId, currentSession);
      }
    });

    const session: TerminalSession = {
      pty,
      dataDisposable,
      label,
      workspaceId,
      status: 'active',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      scrollback,
      protection: { ...TerminalManager.DEFAULT_PROTECTION_STATE },
      pendingBufferBytes: 0,
      recentOutput: [],
      recentOutputBytes: 0,
      lastProtectionWarningAt: 0,
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

  public listTerminals(): TerminalSessionInfo[] {
    return [...this.sessions.entries()].map(([terminalId, session]) => ({
      terminalId,
      label: session.label,
      workspaceId: session.workspaceId,
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
    for (const [terminalId, session] of this.sessions) {
      this.recalculateProtectionState(terminalId, session);
    }

    for (const [terminalId, chunks] of this.buffers) {
      if (chunks.length === 0) {
        continue;
      }

      const data = chunks.join('');
      chunks.length = 0;
      const session = this.sessions.get(terminalId);
      if (session) {
        session.pendingBufferBytes = 0;
        this.recalculateProtectionState(terminalId, session);
      }
      this.callbacks.onData({ terminalId, data });
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

  private normalizeScrollback(scrollback?: number): number {
    if (typeof scrollback !== 'number' || !Number.isFinite(scrollback)) {
      return DEFAULT_TERMINAL_SCROLLBACK;
    }

    const normalized = Math.round(scrollback);
    return Math.min(MAX_TERMINAL_SCROLLBACK, Math.max(MIN_TERMINAL_SCROLLBACK, normalized));
  }

  private recordOutputSample(session: TerminalSession, timestamp: number, bytes: number): void {
    session.recentOutput.push({ timestamp, bytes });
    session.recentOutputBytes += bytes;
    this.trimOutputSamples(session, timestamp);
  }

  private trimOutputSamples(session: TerminalSession, now: number): void {
    while (session.recentOutput.length > 0) {
      const oldest = session.recentOutput[0];
      if (!oldest || now - oldest.timestamp < TERMINAL_OUTPUT_SAMPLE_WINDOW_MS) {
        break;
      }

      session.recentOutput.shift();
      session.recentOutputBytes -= oldest.bytes;
    }
  }

  private recalculateProtectionState(terminalId: TerminalId, session: TerminalSession): void {
    const now = Date.now();
    this.trimOutputSamples(session, now);

    const outputBytesPerSecond = session.recentOutputBytes;
    const nextRenderMode = session.protection.renderMode === 'throttled'
      ? (outputBytesPerSecond <= TERMINAL_OUTPUT_RECOVERY_BYTES_PER_SECOND ? 'realtime' : 'throttled')
      : (outputBytesPerSecond >= TERMINAL_OUTPUT_THROTTLE_BYTES_PER_SECOND ? 'throttled' : 'realtime');

    const hasBufferPressure = session.pendingBufferBytes >= TERMINAL_PENDING_BUFFER_WARNING_BYTES;
    const warning = this.buildProtectionWarning(nextRenderMode, hasBufferPressure);
    const nextProtection: TerminalProtectionState = {
      renderMode: nextRenderMode,
      isProtectionActive: warning !== null,
      outputBytesPerSecond,
      pendingBufferBytes: session.pendingBufferBytes,
      warning,
    };

    const previousProtection = session.protection;
    session.protection = nextProtection;

    const hasMeaningfulChange = previousProtection.renderMode !== nextProtection.renderMode
      || previousProtection.isProtectionActive !== nextProtection.isProtectionActive
      || previousProtection.warning !== nextProtection.warning;

    if (hasMeaningfulChange) {
      this.callbacks.onProtectionChange?.({
        terminalId,
        protection: { ...nextProtection },
      });
    }

    const warningActivated = nextProtection.warning !== null && previousProtection.warning === null;
    if (warningActivated && (now - session.lastProtectionWarningAt >= TERMINAL_PROTECTION_WARNING_COOLDOWN_MS)) {
      session.lastProtectionWarningAt = now;
      this.callbacks.onProtectionWarning?.({
        terminalId,
        protection: { ...nextProtection },
      });
    }
  }

  private buildProtectionWarning(
    renderMode: TerminalProtectionState['renderMode'],
    hasBufferPressure: boolean,
  ): string | null {
    if (renderMode === 'throttled') {
      return 'High-output protection active. Rendering is throttled to keep this terminal responsive.';
    }

    if (hasBufferPressure) {
      return 'Terminal buffer pressure is high. RAM protection is limiting backlog growth.';
    }

    return null;
  }

  private buildEnvironment(): Record<string, string> {
    const entries = Object.entries(process.env).filter(
      ([key, value]) => typeof value === 'string' && !TerminalManager.STRIPPED_ENV_VARS.has(key),
    );
    return Object.fromEntries(entries) as Record<string, string>;
  }
}
