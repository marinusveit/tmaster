import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventExtractor } from '@main/events/eventExtractor';
import type { EventSource, EventType } from '@shared/types/event';

describe('EventExtractor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('erkennt Error-Muster', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('t1', 'Error: Cannot find module "foo"');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.summary).toContain('Cannot find module');
    expect(events[0]?.source).toBe('pattern');
  });

  it('erkennt Warning-Muster', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('t1', 'Warning: deprecated function used');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('warning');
    expect(events[0]?.summary).toContain('deprecated');
  });

  it('erkennt Test-Result-Muster (FAIL)', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('t1', 'FAIL src/auth.test.ts 3 tests failed');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('test_result');
    expect(events[0]?.summary).toContain('FAIL');
  });

  it('erkennt Test-Result-Muster (PASS)', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('t1', 'Tests: 5 passed, 5 total');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('test_result');
  });

  it('erkennt Server-Started-Muster', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('t1', 'Server listening on port 3000');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('server_started');
    expect(events[0]?.summary).toContain('3000');
  });

  it('erkennt Context-Warning-Muster', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('t1', 'context window usage at 85%');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('context_warning');
    expect(events[0]?.summary).toContain('85%');
  });

  it('erkennt Waiting-Muster', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('t1', 'Proceed with deploy? ⏳ waiting for input');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('waiting');
    expect(events[0]?.summary).toBe('Proceed with deploy?');
  });

  it('zieht bei Waiting die eigentliche Rueckfrage in die Summary', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('t1', 'Apply database migration now? [Y/n]\n⏳ waiting for input');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('waiting');
    expect(events[0]?.summary).toBe('Apply database migration now? [Y/n]');
  });

  it('erkennt mehrere Patterns in einem Chunk', () => {
    const extractor = new EventExtractor();
    const data = 'Error: fail\nWarning: deprecation\nlistening on port 8080';
    const events = extractor.extract('t1', data);

    expect(events.length).toBeGreaterThanOrEqual(3);
    const types = events.map((e) => e.type);
    expect(types).toContain('error');
    expect(types).toContain('warning');
    expect(types).toContain('server_started');
  });

  it('gibt leeres Array bei normalem Output zurueck', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('t1', 'user@host:~$ ls -la\ntotal 42');

    expect(events).toHaveLength(0);
  });

  it('truncated Summary bei mehr als 200 Zeichen', () => {
    const extractor = new EventExtractor();
    const longMessage = `Error: ${'x'.repeat(300)}`;
    const events = extractor.extract('t1', longMessage);

    expect(events).toHaveLength(1);
    expect(events[0]?.summary.length).toBeLessThanOrEqual(200);
    expect(events[0]?.summary).toMatch(/\.\.\.$/);
  });

  it('unterstuetzt Custom Patterns', () => {
    const extractor = new EventExtractor({
      customPatterns: [
        {
          regex: /deploy\s+completed/i,
          type: 'server_started' as EventType,
          source: 'pattern' as EventSource,
          buildSummary: () => 'Deployment completed',
        },
      ],
    });

    const events = extractor.extract('t1', 'Deploy completed successfully');
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('Deployment completed');
  });

  it('setzt korrekte terminalId und timestamp', () => {
    const extractor = new EventExtractor();
    const events = extractor.extract('my-terminal-42', 'Error: something');

    expect(events).toHaveLength(1);
    expect(events[0]?.terminalId).toBe('my-terminal-42');
    expect(events[0]?.timestamp).toBe(Date.now());
  });
});
