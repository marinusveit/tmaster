import type { EventType, EventSource, TerminalEvent } from '../../shared/types/event';

const MAX_SUMMARY_LENGTH = 200;

interface EventPattern {
  regex: RegExp;
  type: EventType;
  source: EventSource;
  buildSummary?: (match: RegExpMatchArray) => string;
}

export interface EventExtractorConfig {
  customPatterns?: EventPattern[];
}

const DEFAULT_PATTERNS: EventPattern[] = [
  {
    regex: /(?:^|\n).*(?:error|Error|ERROR)[:\s](.+)/,
    type: 'error',
    source: 'pattern',
    buildSummary: (match) => match[1]?.trim() ?? 'Error detected',
  },
  {
    regex: /(?:^|\n).*(?:warning|Warning|WARN)[:\s](.+)/,
    type: 'warning',
    source: 'pattern',
    buildSummary: (match) => match[1]?.trim() ?? 'Warning detected',
  },
  {
    regex: /(?:FAIL|PASS|Tests?:)\s*(.+)/,
    type: 'test_result',
    source: 'pattern',
    buildSummary: (match) => match[0]?.trim() ?? 'Test result',
  },
  {
    regex: /(?:listening|started|running)\s+(?:on|at)\s+(?:port\s+)?(\d+)/i,
    type: 'server_started',
    source: 'pattern',
    buildSummary: (match) => `Server started on port ${match[1] ?? 'unknown'}`,
  },
  {
    regex: /context\s*window.*?(\d+)%/i,
    type: 'context_warning',
    source: 'pattern',
    buildSummary: (match) => `Context window at ${match[1] ?? '?'}%`,
  },
  {
    regex: /waiting\s+for\s+input|⏳/i,
    type: 'waiting',
    source: 'pattern',
    buildSummary: () => 'Waiting for input',
  },
];

const truncate = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
};

export class EventExtractor {
  private readonly patterns: EventPattern[];

  public constructor(config?: EventExtractorConfig) {
    this.patterns = [...DEFAULT_PATTERNS, ...(config?.customPatterns ?? [])];
  }

  public extract(terminalId: string, data: string): TerminalEvent[] {
    const events: TerminalEvent[] = [];
    const now = Date.now();

    for (const pattern of this.patterns) {
      const match = data.match(pattern.regex);
      if (!match) {
        continue;
      }

      const rawSummary = pattern.buildSummary
        ? pattern.buildSummary(match)
        : (match[0]?.trim() ?? 'Event detected');

      events.push({
        terminalId,
        timestamp: now,
        type: pattern.type,
        summary: truncate(rawSummary, MAX_SUMMARY_LENGTH),
        details: truncate(data, 1000),
        source: pattern.source,
      });
    }

    return events;
  }
}
