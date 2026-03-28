import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { RecommendationEngine, type TerminalState } from '@main/assistant/RecommendationEngine';
import { createSession, createWorkspace, insertEvent } from '@main/db/queries';

const createTestDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

describe('RecommendationEngine', () => {
  let db: InstanceType<typeof Database>;
  let terminalStates: Map<string, TerminalState>;
  let engine: RecommendationEngine;
  let onSuggestion: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);

    db = createTestDb();
    createWorkspace(db, 'ws1', 'Workspace', '/tmp/ws1', Date.now());
    createSession(db, 's1', 't1', 'ws1', 'T', 1, null, Date.now());

    terminalStates = new Map([
      ['t1', { terminalId: 't1', status: 'idle', lastActivity: Date.now() - (11 * 60 * 1000), workspaceId: 'ws1' }],
    ]);

    onSuggestion = vi.fn();
    engine = new RecommendationEngine(db, () => terminalStates, onSuggestion);
  });

  afterEach(() => {
    engine.dispose();
    db.close();
    vi.useRealTimers();
  });

  it('evaluate erzeugt idle-Suggestion', () => {
    const suggestions = engine.evaluate();
    expect(suggestions.some((s) => s.category === 'idle')).toBe(true);
  });

  it('evaluate erzeugt Error-Suggestion bei wiederholten Fehlern', () => {
    insertEvent(db, 's1', Date.now() - 2000, 'error', 'E_CONN', null);
    insertEvent(db, 's1', Date.now() - 1800, 'error', 'E_CONN', null);
    insertEvent(db, 's1', Date.now() - 1600, 'error', 'E_CONN', null);
    insertEvent(db, 's1', Date.now() - 1400, 'error', 'E_CONN', null);

    const suggestions = engine.evaluate();
    expect(suggestions.some((s) => s.title.includes('wiederholt Fehler'))).toBe(true);
  });

  it('evaluate erzeugt Context-Suggestion bei context_warning', () => {
    insertEvent(db, 's1', Date.now() - 1000, 'context_warning', 'context window at 90%', null);

    const suggestions = engine.evaluate();
    expect(suggestions.some((s) => s.category === 'context')).toBe(true);
  });

  it('coachingLevel observe liefert nur high/critical', () => {
    engine.setCoachingLevel('observe');
    insertEvent(db, 's1', Date.now() - 1000, 'error', 'fatal', null);

    const suggestions = engine.evaluate();
    expect(suggestions.every((s) => s.priority === 'high' || s.priority === 'critical')).toBe(true);
  });

  it('coachingLevel suggest enthält idle/context', () => {
    engine.setCoachingLevel('suggest');
    insertEvent(db, 's1', Date.now() - 1000, 'context_warning', 'context window at 90%', null);

    const suggestions = engine.evaluate();
    expect(suggestions.some((s) => s.category === 'idle')).toBe(true);
    expect(suggestions.some((s) => s.category === 'context')).toBe(true);
  });

  it('coachingLevel coach enthält workflow', () => {
    engine.setCoachingLevel('coach');
    insertEvent(db, 's1', Date.now() - 1000, 'test_result', 'PASS all tests', null);

    const suggestions = engine.evaluate();
    expect(suggestions.some((s) => s.category === 'workflow')).toBe(true);
  });

  it('onEvent mit error erzeugt sofortige Suggestion', () => {
    engine.onEvent({
      terminalId: 't1',
      timestamp: Date.now(),
      type: 'error',
      summary: 'instant error',
      source: 'pattern',
    });

    expect(onSuggestion).toHaveBeenCalled();
  });

  it('onEvent mit waiting erzeugt sofortige Workflow-Suggestion mit Hint', () => {
    engine.onEvent({
      terminalId: 't1',
      timestamp: Date.now(),
      type: 'waiting',
      summary: 'Delete generated cache? [y/N]',
      source: 'pattern',
    });

    expect(onSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      category: 'workflow',
      title: 't1 wartet auf Input',
      description: expect.stringContaining('Eher mit "n" abbrechen'),
    }));
  });

  it('buildWaitingResponseHint erkennt Enter-Prompts', () => {
    const hint = engine.buildWaitingResponseHint({
      terminalId: 't1',
      timestamp: Date.now(),
      type: 'waiting',
      summary: 'Press Enter to continue',
      source: 'pattern',
    });

    expect(hint).toContain('Enter senden');
  });

  it('dispose stoppt Interval', () => {
    engine.start();
    engine.dispose();

    const callCount = onSuggestion.mock.calls.length;
    vi.advanceTimersByTime(31_000);
    expect(onSuggestion.mock.calls.length).toBe(callCount);
  });

  it('verhindert Duplikate innerhalb des Cooldowns', () => {
    insertEvent(db, 's1', Date.now() - 1000, 'context_warning', 'context window at 90%', null);

    engine.evaluate();
    const firstCallCount = onSuggestion.mock.calls.length;
    engine.evaluate();

    expect(onSuggestion.mock.calls.length).toBe(firstCallCount);
  });
});
