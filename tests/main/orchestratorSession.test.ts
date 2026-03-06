import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Mock child_process
const mockSpawn = vi.fn();
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// Import nach dem Mock
import { OrchestratorSession } from '@main/orchestrator/OrchestratorSession';
import type { AssistantStreamChunk } from '@shared/types/assistant';

const createMockProcess = (): ChildProcess & {
  emitStdout: (data: string) => void;
  emitClose: (code: number | null) => void;
  emitError: (error: Error) => void;
} => {
  const proc = new EventEmitter() as ChildProcess & {
    emitStdout: (data: string) => void;
    emitClose: (code: number | null) => void;
    emitError: (error: Error) => void;
  };

  // Einfache EventEmitter-basierte Streams statt echten Streams
  const mockStdout = new EventEmitter();
  const mockStderr = new EventEmitter();

  // resume() damit OrchestratorSession stderr.resume() aufrufen kann
  (mockStderr as EventEmitter & { resume: () => void }).resume = vi.fn();

  proc.stdout = mockStdout as ChildProcess['stdout'];
  proc.stderr = mockStderr as ChildProcess['stderr'];
  proc.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as ChildProcess['stdin'];
  proc.kill = vi.fn(() => true);

  proc.emitStdout = (data: string) => {
    mockStdout.emit('data', Buffer.from(data));
  };
  proc.emitClose = (code: number | null) => {
    proc.emit('close', code);
  };
  proc.emitError = (error: Error) => {
    proc.emit('error', error);
  };

  return proc;
};

describe('OrchestratorSession', () => {
  let onStreamChunk: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    onStreamChunk = vi.fn();
    onError = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createSession = (overrides?: {
    mcpConfigPath?: string;
    timeoutMs?: number;
  }): OrchestratorSession => {
    return new OrchestratorSession({
      systemPrompt: 'Du bist ein Test-Orchestrator.',
      onStreamChunk,
      onError,
      ...overrides,
    });
  };

  describe('isAvailable', () => {
    it('gibt true zurueck wenn claude --version erfolgreich laeuft', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: (err: unknown, stdout: string) => void) => {
          cb(null, 'claude 1.0.0');
        },
      );

      const session = createSession();
      const result = await session.isAvailable();
      expect(result).toBe(true);
    });

    it('gibt false zurueck wenn claude nicht gefunden wird', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: (err: unknown, stdout: string) => void) => {
          cb(new Error('ENOENT'), '');
        },
      );

      const session = createSession();
      const result = await session.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('spawnt claude mit korrekten Args beim ersten Aufruf (ohne --resume)', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Hallo');

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '--output-format', 'stream-json', '--append-system-prompt']),
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
      );

      // Kein --resume beim ersten Aufruf
      const args = mockSpawn.mock.calls[0]?.[1] as string[];
      expect(args).not.toContain('--resume');
    });

    it('spawnt mit --resume nach empfangener session_id', () => {
      const proc1 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc1);

      const session = createSession();
      session.sendMessage('Erste Nachricht');

      // Session-ID ueber NDJSON result senden
      proc1.emitStdout('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Antwort"}}\n');
      proc1.emitStdout('{"type":"result","session_id":"sess-abc-123","result":"Antwort"}\n');
      proc1.emitClose(0);

      // Zweite Nachricht
      const proc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc2);
      session.sendMessage('Zweite Nachricht');

      const args = mockSpawn.mock.calls[1]?.[1] as string[];
      expect(args).toContain('--resume');
      expect(args).toContain('sess-abc-123');
    });

    it('parsed content_block_delta Chunks und sendet sie als Stream-Chunks', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Test');

      proc.emitStdout('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hallo "}}\n');
      proc.emitStdout('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Welt"}}\n');

      expect(onStreamChunk).toHaveBeenCalledTimes(2);
      expect(onStreamChunk.mock.calls[0]?.[0]).toMatchObject({
        text: 'Hallo ',
        isFinal: false,
      });
      expect(onStreamChunk.mock.calls[1]?.[0]).toMatchObject({
        text: 'Welt',
        isFinal: false,
      });
    });

    it('sendet finalen Chunk bei close mit Exit-Code 0', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Test');

      proc.emitStdout('{"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n');
      proc.emitClose(0);

      const lastChunk = onStreamChunk.mock.calls.at(-1)?.[0] as AssistantStreamChunk;
      expect(lastChunk.isFinal).toBe(true);
    });

    it('ruft onError bei non-zero Exit-Code auf', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Test');

      proc.emitClose(1);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[1]).toContain('Exit-Code 1');
      expect(onStreamChunk).not.toHaveBeenCalled();
    });

    it('setzt --mcp-config Flag wenn mcpConfigPath angegeben', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession({ mcpConfigPath: '/tmp/mcp.json' });
      session.sendMessage('Test');

      const args = mockSpawn.mock.calls[0]?.[1] as string[];
      expect(args).toContain('--mcp-config');
      expect(args).toContain('/tmp/mcp.json');
    });

    it('setzt kein --mcp-config Flag wenn kein Pfad angegeben', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Test');

      const args = mockSpawn.mock.calls[0]?.[1] as string[];
      expect(args).not.toContain('--mcp-config');
    });
  });

  describe('Queue', () => {
    it('queued Nachrichten wenn eine bereits verarbeitet wird', () => {
      const proc1 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc1);

      const session = createSession();
      session.sendMessage('Erste');
      session.sendMessage('Zweite');

      // Nur ein Prozess gestartet
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Ersten Prozess beenden
      const proc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc2);
      proc1.emitClose(0);

      // Zweiter Prozess wird automatisch gestartet
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
  });

  describe('abort', () => {
    it('killt den aktiven Prozess', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Test');
      session.abort();

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('sendet finalen Chunk nach abort', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Test');
      session.abort();

      const finalChunk = onStreamChunk.mock.calls.at(-1)?.[0] as AssistantStreamChunk;
      expect(finalChunk.isFinal).toBe(true);
    });

    it('verhindert Timeout-Fehler nach abort', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession({ timeoutMs: 5_000 });
      session.sendMessage('Test');
      session.abort();
      vi.advanceTimersByTime(5_000);

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('resetSession', () => {
    it('loescht die session_id', () => {
      const proc1 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc1);

      const session = createSession();
      session.sendMessage('Erste');

      proc1.emitStdout('{"type":"result","session_id":"sess-xyz","result":"ok"}\n');
      proc1.emitClose(0);

      session.resetSession();

      const proc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc2);
      session.sendMessage('Nach Reset');

      const args = mockSpawn.mock.calls[1]?.[1] as string[];
      expect(args).not.toContain('--resume');
    });
  });

  describe('dispose', () => {
    it('ignoriert neue Nachrichten nach dispose', () => {
      const session = createSession();
      session.dispose();
      session.sendMessage('Sollte ignoriert werden');

      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('killt den Prozess nach Timeout', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession({ timeoutMs: 5000 });
      session.sendMessage('Test');

      vi.advanceTimersByTime(5000);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[1]).toContain('Timeout');
    });
  });

  describe('stdin sanitization', () => {
    it('entfernt unsupported control characters vor stdin.write', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Hallo\u0007 Welt');

      const stdinWrite = proc.stdin?.write as ReturnType<typeof vi.fn>;
      expect(stdinWrite).toHaveBeenCalledWith('Hallo Welt');
    });
  });

  describe('stderr capture', () => {
    it('haengt stderr an die Exit-Fehlermeldung an', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Test');

      proc.stderr?.emit('data', Buffer.from('permission denied'));
      proc.emitClose(2);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[1]).toContain('permission denied');
    });
  });

  describe('Prozess-Fehler', () => {
    it('ruft onError bei spawn-Fehler auf', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = createSession();
      session.sendMessage('Test');

      proc.emitError(new Error('spawn ENOENT'));

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[1]).toContain('ENOENT');
    });
  });
});
