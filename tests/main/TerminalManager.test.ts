import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPty } from 'node-pty';
import { spawn } from 'node-pty';
import { TerminalManager } from '@main/terminal/TerminalManager';

interface FakePty extends IPty {
  emitData: (data: string) => void;
}

const fakePtys: FakePty[] = [];

vi.mock('node-pty', () => {
  return {
    spawn: vi.fn(() => {
      let onDataCallback: ((data: string) => void) | null = null;
      let onExitCallback: ((event: { exitCode: number; signal: number }) => void) | null = null;

      const pty: FakePty = {
        process: 'bash',
        pid: Math.floor(Math.random() * 10000),
        cols: 80,
        rows: 24,
        handleFlowControl: false,
        write: vi.fn(),
        resize: vi.fn(),
        clear: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        kill: vi.fn(() => {
          onExitCallback?.({ exitCode: 0, signal: 15 });
        }),
        onData: (callback) => {
          onDataCallback = callback;
          return { dispose: vi.fn() };
        },
        onExit: (callback) => {
          onExitCallback = callback;
          return { dispose: vi.fn() };
        },
        onBinary: vi.fn(),
        emitData: (data: string) => {
          onDataCallback?.(data);
        },
      } as unknown as FakePty;

      fakePtys.push(pty);
      return pty;
    }),
  };
});

describe('TerminalManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakePtys.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates, writes and closes terminal sessions', () => {
    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    const { terminalId } = manager.createTerminal({});
    manager.writeTerminal(terminalId, 'echo test\n');

    expect(fakePtys[0]?.write).toHaveBeenCalledWith('echo test\n');

    manager.closeTerminal(terminalId);
    manager.closeTerminal(terminalId);

    expect(fakePtys[0]?.kill).toHaveBeenCalledTimes(1);
    manager.destroyAll();
  });

  it('batches terminal output every 16ms', () => {
    const onData = vi.fn();
    const manager = new TerminalManager({
      onData,
      onExit: vi.fn(),
    });

    const { terminalId } = manager.createTerminal({});

    fakePtys[0]?.emitData('abc');
    fakePtys[0]?.emitData('123');

    vi.advanceTimersByTime(16);

    expect(onData).toHaveBeenCalledWith({ terminalId, data: 'abc123' });

    manager.destroyAll();
  });

  it('destroys all active sessions on shutdown', () => {
    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    manager.createTerminal({});
    manager.createTerminal({});

    manager.destroyAll();

    expect(fakePtys[0]?.kill).toHaveBeenCalledTimes(1);
    expect(fakePtys[1]?.kill).toHaveBeenCalledTimes(1);
  });

  it('erstellt Labels T1, T2, T3 monoton steigend pro Workspace', () => {
    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    const r1 = manager.createTerminal({ workspaceId: 'ws1' });
    const r2 = manager.createTerminal({ workspaceId: 'ws1' });
    const r3 = manager.createTerminal({ workspaceId: 'ws1' });

    expect(r1.label).toEqual({ prefix: 'T', index: 1 });
    expect(r2.label).toEqual({ prefix: 'T', index: 2 });
    expect(r3.label).toEqual({ prefix: 'T', index: 3 });

    manager.destroyAll();
  });

  it('erstellt unabhängige Label-Counter pro Workspace', () => {
    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    const r1 = manager.createTerminal({ workspaceId: 'ws-a' });
    const r2 = manager.createTerminal({ workspaceId: 'ws-b' });
    const r3 = manager.createTerminal({ workspaceId: 'ws-a' });

    expect(r1.label.index).toBe(1);
    expect(r2.label.index).toBe(1);
    expect(r3.label.index).toBe(2);

    manager.destroyAll();
  });

  it('listTerminals gibt alle aktiven Sessions zurück', () => {
    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    manager.createTerminal({ workspaceId: 'ws1' });
    manager.createTerminal({ workspaceId: 'ws1' });
    manager.createTerminal({ workspaceId: 'ws2' });

    const all = manager.listTerminals();
    expect(all).toHaveLength(3);

    const ws1 = manager.getTerminalsByWorkspace('ws1');
    expect(ws1).toHaveLength(2);

    const ws2 = manager.getTerminalsByWorkspace('ws2');
    expect(ws2).toHaveLength(1);

    manager.destroyAll();
  });

  it('Labels füllen keine Lücken — immer nächster Index', () => {
    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    const r1 = manager.createTerminal({ workspaceId: 'ws1' });
    const r2 = manager.createTerminal({ workspaceId: 'ws1' });
    manager.closeTerminal(r1.terminalId);

    // T2 geschlossen, neues Terminal muss T3 sein (nicht T1)
    const r3 = manager.createTerminal({ workspaceId: 'ws1' });
    expect(r2.label.index).toBe(2);
    expect(r3.label.index).toBe(3);

    manager.destroyAll();
  });

  it('setLabelCounter setzt den Startwert für einen Workspace', () => {
    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    manager.setLabelCounter('ws1', 5);
    const r1 = manager.createTerminal({ workspaceId: 'ws1' });
    expect(r1.label.index).toBe(5);

    const r2 = manager.createTerminal({ workspaceId: 'ws1' });
    expect(r2.label.index).toBe(6);

    manager.destroyAll();
  });

  it('destroyAll räumt alle Sessions auf', () => {
    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    manager.createTerminal({});
    manager.createTerminal({});
    manager.createTerminal({});

    expect(manager.getSessionCount()).toBe(3);

    manager.destroyAll();

    expect(manager.getSessionCount()).toBe(0);
  });

  it('entfernt CLAUDECODE aus der PTY-Umgebung', () => {
    const mockedSpawn = vi.mocked(spawn);

    // CLAUDECODE simulieren (z.B. wenn tmaster aus einer Claude Code Session gestartet wird)
    process.env.CLAUDECODE = '1';

    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    manager.createTerminal({});

    const spawnCall = mockedSpawn.mock.calls.at(-1);
    const env = spawnCall?.[2]?.env as Record<string, string> | undefined;
    expect(env).toBeDefined();
    expect(env).not.toHaveProperty('CLAUDECODE');

    // Aufräumen
    delete process.env.CLAUDECODE;
    manager.destroyAll();
  });

  it('dispose beendet den Manager dauerhaft', () => {
    const manager = new TerminalManager({
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    manager.createTerminal({});
    manager.dispose();

    expect(manager.getSessionCount()).toBe(0);
    expect(() => manager.createTerminal({})).toThrow('disposed');
  });
});
