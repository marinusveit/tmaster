import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  ReorderTerminalsRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalId,
  TerminalLabel,
  TerminalSessionInfo,
} from '../../shared/types/terminal';
import type { WorkspaceId } from '../../shared/types/workspace';
import { MAX_TERMINALS, TERMINAL_LABEL_PREFIX } from '../../shared/constants/defaults';

interface TerminalSession {
  pty: IPty;
  dataDisposable: { dispose: () => void };
  label: TerminalLabel;
  workspaceId: WorkspaceId;
  displayOrder: number;
  status: 'active' | 'idle' | 'exited';
  createdAt: number;
  lastActivity: number;
}

interface TerminalManagerCallbacks {
  onData: (event: TerminalDataEvent) => void;
  onExit: (event: TerminalExitEvent) => void;
  onStatusChange?: (terminalId: TerminalId, status: 'active' | 'idle' | 'exited') => void;
}

export class TerminalManager {
  private readonly sessions = new Map<TerminalId, TerminalSession>();
  private readonly buffers = new Map<TerminalId, string[]>();
  private readonly flushInterval: NodeJS.Timeout;
  private readonly labelCounters = new Map<WorkspaceId, number>();
  private isDisposed = false;
  private static readonly DEFAULT_WORKSPACE_ID = 'default';

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
      chunks.push(data);
      const currentSession = this.sessions.get(terminalId);
      if (currentSession) {
        currentSession.lastActivity = Date.now();
      }
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

    return { terminalId, label, workspaceId, displayOrder };
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
    for (const [terminalId, chunks] of this.buffers) {
      if (chunks.length === 0) {
        continue;
      }

      const data = chunks.join('');
      chunks.length = 0;
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

  private buildEnvironment(): Record<string, string> {
    const entries = Object.entries(process.env).filter(
      ([key, value]) => typeof value === 'string' && !TerminalManager.STRIPPED_ENV_VARS.has(key),
    );
    return Object.fromEntries(entries) as Record<string, string>;
  }
}
