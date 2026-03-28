import type { EventType, EventSource, TerminalEvent } from '../../shared/types/event';

const MAX_SUMMARY_LENGTH = 200;

interface EventPattern {
  regex: RegExp;
  type: EventType;
  source: EventSource;
  buildSummary?: (match: RegExpMatchArray, data: string) => string;
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
    regex: /([^\n]*(?:waiting\s+for\s+input|⏳)[^\n]*)/i,
    type: 'waiting',
    source: 'pattern',
    buildSummary: (_match, data) => extractWaitingSummary(data),
  },
];

const truncate = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
};

const GENERIC_WAITING_SUMMARY_REGEX = /^(?:⏳\s*)?waiting\s+for\s+input$/i;
const WAITING_CONTEXT_REGEX = /(?:\?\s*(?:\[[Yy]\/[Nn]\]|\[[Yy]es\/[Nn]o\]|\([Yy]\/[Nn]\)|\(yes\/no\))?|press\s+enter|hit\s+enter|confirm|continue|proceed|overwrite|delete|install|retry)/i;
const WAITING_TRAILING_MARKER_REGEX = /\s*(?:⏳\s*)?waiting\s+for\s+input\s*$/i;

const sanitizeWaitingLine = (line: string): string => {
  const sanitizedLine = line.replace(WAITING_TRAILING_MARKER_REGEX, '').trim();
  return sanitizedLine.length > 0 ? sanitizedLine : line.trim();
};

const extractWaitingSummary = (data: string): string => {
  const lines = data
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    if (WAITING_CONTEXT_REGEX.test(line) && !GENERIC_WAITING_SUMMARY_REGEX.test(line)) {
      return sanitizeWaitingLine(line);
    }

    if (line.includes('?') && !GENERIC_WAITING_SUMMARY_REGEX.test(line)) {
      return sanitizeWaitingLine(line);
    }
  }

  const contextualLine = lines.find((line) => !GENERIC_WAITING_SUMMARY_REGEX.test(line));
  return contextualLine ? sanitizeWaitingLine(contextualLine) : 'Waiting for input';
};

export class EventExtractor {
  private readonly patterns: EventPattern[];

  public constructor(config?: EventExtractorConfig) {
    this.patterns = [...DEFAULT_PATTERNS, ...(config?.customPatterns ?? [])];
  }

  public extract(terminalId: string, data: string): TerminalEvent[] {
    const events: TerminalEvent[] = [];
    const seen = new Set<string>();
    const now = Date.now();

    for (const pattern of this.patterns) {
      const globalRegex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`);
      for (const match of data.matchAll(globalRegex)) {
        const rawSummary = pattern.buildSummary
          ? pattern.buildSummary(match, data)
          : (match[0]?.trim() ?? 'Event detected');

        const summary = truncate(rawSummary, MAX_SUMMARY_LENGTH);
        const dedupKey = `${pattern.type}:${summary}`;
        if (seen.has(dedupKey)) {
          continue;
        }
        seen.add(dedupKey);

        events.push({
          terminalId,
          timestamp: now,
          type: pattern.type,
          summary,
          details: truncate(data, 1000),
          source: pattern.source,
        });
      }
    }

    return events;
  }
}
