import type { ChildProcess, ExecFileException } from 'node:child_process';
import { execFile } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TriageService } from '@main/triage/TriageService';
import type { TriageRequest } from '@shared/types/triage';

vi.mock('node:child_process', () => {
  return {
    execFile: vi.fn(),
  };
});

type ExecFileCallback = (error: ExecFileException | null, stdout: string, stderr: string) => void;

interface ExecFileInvocation {
  file: string;
  args: string[];
  options: Record<string, unknown>;
  callback: ExecFileCallback;
}

const BASE_REQUEST: TriageRequest = {
  terminalId: 'terminal-1',
  agentType: 'claude',
  recentOutput: 'Please confirm this plan before I continue.',
  triggerReason: 'ambiguous_keyword',
  terminalMeta: {
    status: 'active',
    runtimeSeconds: 120,
    lastEventType: 'warning',
  },
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const createExecFileError = (message: string, code: string | number): ExecFileException => {
  const error = new Error(message) as ExecFileException;
  error.code = code;
  return error;
};

const configureExecFileMock = (
  onInvoke: (invocation: ExecFileInvocation, stdinEnd: ReturnType<typeof vi.fn>) => void,
): ReturnType<typeof vi.fn> => {
  const mockedExecFile = vi.mocked(execFile);
  const stdinEnd = vi.fn();

  mockedExecFile.mockImplementation(((...invocation: unknown[]) => {
    const [file, args, options, callback] = invocation;

    if (typeof file !== 'string' || !Array.isArray(args) || !isObjectRecord(options) || typeof callback !== 'function') {
      throw new Error('Unexpected execFile invocation');
    }

    const typedArgs = args.filter((item): item is string => typeof item === 'string');
    const typedCallback = callback as ExecFileCallback;
    onInvoke(
      {
        file,
        args: typedArgs,
        options,
        callback: typedCallback,
      },
      stdinEnd,
    );

    return { stdin: { end: stdinEnd } } as unknown as ChildProcess;
  }) as unknown as typeof execFile);

  return stdinEnd;
};

describe('TriageService', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it('analyze() parsed gueltige Claude-JSON-Antworten', async () => {
    const stdinEnd = configureExecFileMock(({ callback }) => {
      callback(
        null,
        JSON.stringify({
          result: JSON.stringify({
            status: 'action_required',
            summary: 'Waiting for confirmation',
            detail: 'Please confirm plan with y',
            urgency: 'high',
            escalate: false,
          }),
        }),
        '',
      );
    });

    const service = new TriageService('claude');
    const result = await service.analyze(BASE_REQUEST);

    expect(result).toEqual({
      status: 'action_required',
      summary: 'Waiting for confirmation',
      detail: 'Please confirm plan with y',
      urgency: 'high',
      escalate: false,
    });

    expect(stdinEnd).toHaveBeenCalledTimes(1);
    const promptArg = stdinEnd.mock.calls[0]?.[0];
    expect(typeof promptArg).toBe('string');
    if (typeof promptArg === 'string') {
      expect(promptArg).toContain('terminal-1');
      expect(promptArg).toContain('ambiguous_keyword');
      expect(promptArg).toContain('"recentOutput"');
      expect(promptArg).toContain('Please confirm this plan before I continue.');
    }

    const firstCall = vi.mocked(execFile).mock.calls[0];
    expect(firstCall?.[1]).toEqual(['-p', '--output-format', 'json']);
    const options = firstCall?.[2];
    if (!isObjectRecord(options)) {
      throw new Error('execFile options missing');
    }

    expect(options.timeout).toBe(30_000);
    expect(options.maxBuffer).toBe(1024 * 64);
    expect(options.shell).not.toBe(true);
  });

  it('analyze() gibt null bei ungueltigem JSON auf stdout zurueck', async () => {
    configureExecFileMock(({ callback }) => {
      callback(null, 'not valid json', '');
    });

    const service = new TriageService('claude');
    const result = await service.analyze(BASE_REQUEST);

    expect(result).toBeNull();
  });

  it('analyze() gibt null zurueck wenn claude CLI nicht gefunden wird (ENOENT)', async () => {
    configureExecFileMock(({ callback }) => {
      callback(createExecFileError('spawn ENOENT', 'ENOENT'), '', '');
    });

    const service = new TriageService('claude');
    const result = await service.analyze(BASE_REQUEST);

    expect(result).toBeNull();
  });

  it('analyze() gibt null bei Timeout zurueck', async () => {
    configureExecFileMock(({ callback }) => {
      const timeoutError = createExecFileError('Command timed out', 'ETIMEDOUT');
      timeoutError.killed = true;
      callback(timeoutError, '', '');
    });

    const service = new TriageService('claude');
    const result = await service.analyze(BASE_REQUEST);

    expect(result).toBeNull();
  });

  it('analyze() gibt null bei Exit-Code ungleich 0 zurueck', async () => {
    configureExecFileMock(({ callback }) => {
      callback(createExecFileError('Command failed', 1), '', 'failed');
    });

    const service = new TriageService('claude');
    const result = await service.analyze(BASE_REQUEST);

    expect(result).toBeNull();
  });

  it('analyze() entfernt Steuerzeichen aus Terminal-Output im Prompt', async () => {
    const dirtyRequest: TriageRequest = {
      ...BASE_REQUEST,
      recentOutput: 'Line 1\u0007Line 2',
    };

    const stdinEnd = configureExecFileMock(({ callback }) => {
      callback(
        null,
        JSON.stringify({
          result: JSON.stringify({
            status: 'working',
            summary: 'Still running',
            urgency: 'low',
            escalate: false,
          }),
        }),
        '',
      );
    });

    const service = new TriageService('claude');
    await service.analyze(dirtyRequest);

    const promptArg = stdinEnd.mock.calls[0]?.[0];
    expect(typeof promptArg).toBe('string');
    if (typeof promptArg === 'string') {
      expect(promptArg).toContain('Line 1Line 2');
      expect(promptArg).not.toContain('\u0007');
    }
  });

  it('isAvailable() liefert true bei erfolgreichem --version Aufruf', async () => {
    configureExecFileMock(({ callback }) => {
      callback(null, 'claude 1.0.0', '');
    });

    const service = new TriageService('claude');
    const available = await service.isAvailable();

    expect(available).toBe(true);
    const firstCall = vi.mocked(execFile).mock.calls[0];
    expect(firstCall?.[1]).toEqual(['--version']);
  });

  it('isAvailable() liefert false wenn --version fehlschlaegt', async () => {
    configureExecFileMock(({ callback }) => {
      callback(createExecFileError('not installed', 'ENOENT'), '', '');
    });

    const service = new TriageService('claude');
    const available = await service.isAvailable();

    expect(available).toBe(false);
  });
});
