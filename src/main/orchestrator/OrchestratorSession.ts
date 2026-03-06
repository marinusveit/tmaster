import { spawn, execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AssistantStreamChunk } from '../../shared/types/assistant';
import { removeUnsupportedControlCharacters } from '../utils/textSanitization';

const DEFAULT_TIMEOUT_MS = 120_000;
const VERSION_TIMEOUT_MS = 10_000;
const MAX_STDERR_CAPTURE_CHARS = 4_096;

interface OrchestratorSessionOptions {
  claudePath?: string;
  systemPrompt: string;
  mcpConfigPath?: string;
  onStreamChunk: (chunk: AssistantStreamChunk) => void;
  onError: (messageId: string, error: string) => void;
  timeoutMs?: number;
}

interface QueuedMessage {
  content: string;
  messageId: string;
}

// NDJSON-Typen die Claude CLI im stream-json Modus ausgibt
interface StreamJsonAssistant {
  type: 'assistant';
  message: {
    content: Array<{ type: string; text?: string }>;
  };
}

interface StreamJsonContentBlockDelta {
  type: 'content_block_delta';
  delta: {
    type: string;
    text?: string;
  };
}

interface StreamJsonResult {
  type: 'result';
  session_id: string;
  result: string;
}

type StreamJsonEvent = StreamJsonAssistant | StreamJsonContentBlockDelta | StreamJsonResult | { type: string };

export class OrchestratorSession {
  private readonly claudePath: string;
  private readonly systemPrompt: string;
  private readonly mcpConfigPath: string | undefined;
  private readonly onStreamChunk: (chunk: AssistantStreamChunk) => void;
  private readonly onError: (messageId: string, error: string) => void;
  private readonly timeoutMs: number;

  private sessionId: string | null = null;
  private activeProcess: ChildProcess | null = null;
  private activeMessageId: string | null = null;
  private isProcessing = false;
  private queue: QueuedMessage[] = [];
  private disposed = false;
  private timeoutHandle: NodeJS.Timeout | null = null;

  public constructor(options: OrchestratorSessionOptions) {
    this.claudePath = options.claudePath ?? 'claude';
    this.systemPrompt = options.systemPrompt;
    this.mcpConfigPath = options.mcpConfigPath;
    this.onStreamChunk = options.onStreamChunk;
    this.onError = options.onError;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await new Promise<string>((resolve, reject) => {
        execFile(
          this.claudePath,
          ['--version'],
          { timeout: VERSION_TIMEOUT_MS, maxBuffer: 16 * 1024, encoding: 'utf8' },
          (error, stdout) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(stdout);
          },
        );
      });
      return true;
    } catch {
      return false;
    }
  }

  public sendMessage(content: string): void {
    if (this.disposed) {
      return;
    }

    const messageId = randomUUID();

    if (this.isProcessing) {
      this.queue.push({ content, messageId });
      return;
    }

    this.processMessage(content, messageId);
  }

  public abort(): void {
    this.clearTimeoutHandle();

    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }

    if (this.activeMessageId) {
      this.onStreamChunk({
        messageId: this.activeMessageId,
        text: '',
        isFinal: true,
      });
      this.activeMessageId = null;
    }

    this.isProcessing = false;
  }

  public resetSession(): void {
    this.abort();
    this.sessionId = null;
    this.queue = [];
  }

  public dispose(): void {
    this.disposed = true;
    this.abort();
    this.queue = [];
  }

  private processMessage(content: string, messageId: string): void {
    this.isProcessing = true;
    this.activeMessageId = messageId;
    const sanitizedContent = removeUnsupportedControlCharacters(content);

    const args = this.buildArgs();
    const child = spawn(this.claudePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.activeProcess = child;

    let lineBuffer = '';
    let hasReceivedText = false;
    let hasReportedError = false;
    let stderrBuffer = '';

    this.clearTimeoutHandle();
    this.timeoutHandle = setTimeout(() => {
      if (this.activeProcess === child) {
        child.kill('SIGTERM');
        hasReportedError = true;
        this.onError(
          messageId,
          `Timeout: Orchestrator hat nicht rechtzeitig geantwortet.${this.buildStderrSuffix(stderrBuffer)}`,
        );
        this.finishProcessing();
      }
    }, this.timeoutMs);

    child.stdout?.on('data', (data: Buffer) => {
      lineBuffer += data.toString('utf8');

      const lines = lineBuffer.split('\n');
      // Letzte (moeglicherweise unvollstaendige) Zeile behalten
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const event = this.parseLine(trimmed);
        if (!event) {
          continue;
        }

        if (event.type === 'content_block_delta') {
          const delta = event as StreamJsonContentBlockDelta;
          if (delta.delta.text) {
            hasReceivedText = true;
            this.onStreamChunk({
              messageId,
              text: delta.delta.text,
              isFinal: false,
            });
          }
        }

        if (event.type === 'result') {
          const result = event as StreamJsonResult;
          if (result.session_id) {
            this.sessionId = result.session_id;
          }

          // Falls der Result-Block noch Text enthaelt und wir bisher keinen hatten
          if (!hasReceivedText && result.result) {
            this.onStreamChunk({
              messageId,
              text: result.result,
              isFinal: false,
            });
          }
        }
      }
    });

    // Stderr begrenzt mitschneiden, damit Fehlerkontext sichtbar bleibt.
    child.stderr?.on('data', (data: Buffer) => {
      if (stderrBuffer.length >= MAX_STDERR_CAPTURE_CHARS) {
        return;
      }

      const remainingChars = MAX_STDERR_CAPTURE_CHARS - stderrBuffer.length;
      stderrBuffer += data.toString('utf8').slice(0, remainingChars);
    });

    child.on('error', (error: Error) => {
      if (this.activeProcess !== child) {
        return;
      }

      hasReportedError = true;
      this.clearTimeoutHandle();
      this.onError(messageId, `Prozess-Fehler: ${error.message}${this.buildStderrSuffix(stderrBuffer)}`);
      this.finishProcessing();
    });

    child.on('close', (code: number | null) => {
      this.clearTimeoutHandle();

      if (this.activeProcess !== child) {
        // Aborted
        return;
      }

      if (code !== 0 && code !== null) {
        hasReportedError = true;
        this.onError(
          messageId,
          `Claude CLI beendet mit Exit-Code ${String(code)}${this.buildStderrSuffix(stderrBuffer)}`,
        );
      }

      if (!hasReportedError) {
        // Finalen Chunk nur einmal senden.
        this.onStreamChunk({
          messageId,
          text: '',
          isFinal: true,
        });
      }

      this.finishProcessing();
    });

    // Nachricht auf stdin schreiben und schliessen
    if (child.stdin) {
      child.stdin.write(sanitizedContent);
      child.stdin.end();
    }
  }

  private buildArgs(): string[] {
    const args = ['-p', '--output-format', 'stream-json'];

    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    }

    if (this.mcpConfigPath) {
      args.push('--mcp-config', this.mcpConfigPath);
    }

    args.push('--append-system-prompt', this.systemPrompt);

    return args;
  }

  private parseLine(line: string): StreamJsonEvent | null {
    try {
      return JSON.parse(line) as StreamJsonEvent;
    } catch {
      return null;
    }
  }

  private finishProcessing(): void {
    this.clearTimeoutHandle();
    this.activeProcess = null;
    this.activeMessageId = null;
    this.isProcessing = false;

    if (this.disposed) {
      return;
    }

    // Naechste Nachricht aus der Queue verarbeiten
    const next = this.queue.shift();
    if (next) {
      this.processMessage(next.content, next.messageId);
    }
  }

  private clearTimeoutHandle(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private buildStderrSuffix(stderr: string): string {
    const trimmed = stderr.trim();
    if (!trimmed) {
      return '';
    }

    return ` (stderr: ${trimmed})`;
  }
}
