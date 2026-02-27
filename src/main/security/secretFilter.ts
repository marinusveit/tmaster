import { createHash } from 'node:crypto';

export type RedactionMode = 'replace' | 'hash' | 'remove';

export interface SecretFilterConfig {
  redactionMode: RedactionMode;
  customPatterns: RegExp[];
}

const REDACTED_TOKEN = '[REDACTED]';

const DEFAULT_SECRET_PATTERNS: RegExp[] = [
  // OpenAI/API-Key ähnliche Tokens
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  // Klassische Key=Value Zuweisungen
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
  // JWT
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  // Private Key Blöcke
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  // Connection-Strings mit Credentials
  /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s:@]+:[^\s@]+@[^\s]+/gi,
];

const withGlobalFlag = (pattern: RegExp): RegExp => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
};

export class SecretFilter {
  public constructor(private readonly config: SecretFilterConfig) {}

  public redact(output: string): string {
    const patterns = [...DEFAULT_SECRET_PATTERNS, ...this.config.customPatterns].map(withGlobalFlag);
    let redactedOutput = output;

    for (const pattern of patterns) {
      redactedOutput = redactedOutput.replace(pattern, (match) => this.redactMatch(match));
    }

    return redactedOutput;
  }

  private redactMatch(match: string): string {
    if (this.config.redactionMode === 'remove') {
      return '';
    }

    if (this.config.redactionMode === 'hash') {
      const hash = createHash('sha256').update(match).digest('hex').slice(0, 12);
      return `${REDACTED_TOKEN}:${hash}`;
    }

    return REDACTED_TOKEN;
  }
}
