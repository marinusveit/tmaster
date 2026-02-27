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
  TerminalSessionInfo,
} from '../../shared/types/terminal';
import type { WorkspaceId } from '../../shared/types/workspace';
import { TERMINAL_LABEL_PREFIX } from '../../shared/constants/defaults';

interface TerminalSession {
  pty: IPty;
  label: TerminalLabel;
  workspaceId: WorkspaceId;
  status: 'active' | 'idle' | 'exited';
  createdAt: number;
}

interface TerminalManagerCallbacks {
  onData: (event: TerminalDataEvent) => void;
  onExit: (event: TerminalExitEvent) => void;
  onStatusChange?: (terminalId: TerminalId, status: 'active' | 'idle' | 'exited') => void;
}

export class TerminalManager {
  private readonly sessions = new Map<TerminalId, TerminalSession>();
  private readonly buffers = new Map<TerminalId, string>();
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

  public createTerminal(request: CreateTerminalRequest): CreateTerminalResponse {
    if (this.isDisposed) {
      throw new Error('TerminalManager has been disposed');
    }

    const terminalId = randomUUID();
    const workspaceId = request.workspaceId ?? TerminalManager.DEFAULT_WORKSPACE_ID;
    const label = this.getNextLabel(workspaceId);
    const shell = request.shell ?? this.getDefaultShell();
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: request.cwd ?? process.cwd(),
      env: this.buildEnvironment(),
    });

    const session: TerminalSession = {
      pty,
      label,
      workspaceId,
      status: 'active',
      createdAt: Date.now(),
    };
    this.sessions.set(terminalId, session);
    this.buffers.set(terminalId, '');

    pty.onData((data) => {
      const existing = this.buffers.get(terminalId) ?? '';
      this.buffers.set(terminalId, existing + data);
    });

    pty.onExit(({ exitCode, signal }) => {
      const exitedSession = this.sessions.get(terminalId);
      if (exitedSession) {
        exitedSession.status = 'exited';
        this.callbacks.onStatusChange?.(terminalId, 'exited');
      }
      this.buffers.delete(terminalId);
      this.sessions.delete(terminalId);
      this.callbacks.onExit({ terminalId, exitCode, signal });
    });

    return { terminalId, label, workspaceId };
  }

  public writeTerminal(terminalId: TerminalId, data: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }

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
    }));
  }

  public getTerminalsByWorkspace(workspaceId: WorkspaceId): TerminalSessionInfo[] {
    return this.listTerminals().filter((t) => t.workspaceId === workspaceId);
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
    for (const [terminalId, data] of this.buffers) {
      if (!data) {
        continue;
      }

      this.callbacks.onData({ terminalId, data });
      this.buffers.set(terminalId, '');
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
