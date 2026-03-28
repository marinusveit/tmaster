import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import type { CoachingLevel, RichSuggestion, SuggestionAction } from '../../shared/types/assistant';
import type { TerminalEvent } from '../../shared/types/event';

interface EventSummaryRow {
  summary: string;
  count: number;
}

interface SimpleEventRow {
  event_type: string;
  summary: string;
  timestamp: number;
}

export interface TerminalState {
  terminalId: string;
  status: 'active' | 'idle' | 'exited';
  lastActivity: number;
  workspaceId: string;
}

const COOLDOWN_MS = 5 * 60 * 1000;
const GENERIC_WAITING_SUMMARY_REGEX = /^(?:⏳\s*)?waiting\s+for\s+input$/i;
const YES_NO_PROMPT_REGEX = /(?:\[[Yy]\/[Nn]\]|\[[Yy]es\/[Nn]o\]|\([Yy]\/[Nn]\)|\(yes\/no\)|\b(?:yes|no)\b)/i;
const ENTER_PROMPT_REGEX = /(?:press|hit)\s+enter|enter\s+to\s+(?:continue|confirm|proceed)/i;
const DESTRUCTIVE_PROMPT_REGEX = /\b(?:delete|remove|destroy|reset|drop|overwrite|force)\b/i;
const SAFE_CONTINUE_PROMPT_REGEX = /\b(?:continue|proceed|retry|install|apply|merge|start|save|create)\b/i;

const levelPriority: Record<CoachingLevel, number> = {
  observe: 0,
  suggest: 1,
  coach: 2,
  act: 3,
};

const createSuggestion = (params: {
  title: string;
  description: string;
  priority: RichSuggestion['priority'];
  category: RichSuggestion['category'];
  terminalId?: string;
  actions: SuggestionAction[];
}): RichSuggestion => {
  return {
    id: randomUUID(),
    title: params.title,
    description: params.description,
    priority: params.priority,
    category: params.category,
    terminalId: params.terminalId,
    actions: params.actions,
    timestamp: Date.now(),
  };
};

const extractWaitingPrompt = (event: TerminalEvent): string => {
  const summary = event.summary.trim();
  if (summary.length > 0 && !GENERIC_WAITING_SUMMARY_REGEX.test(summary)) {
    return summary;
  }

  const lines = event.details
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0) ?? [];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line && !GENERIC_WAITING_SUMMARY_REGEX.test(line)) {
      return line;
    }
  }

  return 'Wartet auf Input';
};

export class RecommendationEngine {
  private evaluationInterval: ReturnType<typeof setInterval> | null = null;
  private coachingLevel: CoachingLevel = 'suggest';
  private readonly lastSuggestionAt = new Map<string, number>();

  public constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly getTerminalStates: () => Map<string, TerminalState>,
    private readonly onSuggestion: (suggestion: RichSuggestion) => void,
  ) {}

  public start(): void {
    if (this.evaluationInterval) {
      return;
    }

    this.evaluate();
    this.evaluationInterval = setInterval(() => {
      this.evaluate();
    }, 30_000);
  }

  public stop(): void {
    if (!this.evaluationInterval) {
      return;
    }

    clearInterval(this.evaluationInterval);
    this.evaluationInterval = null;
  }

  public setCoachingLevel(level: CoachingLevel): void {
    this.coachingLevel = level;
  }

  public evaluate(): RichSuggestion[] {
    const suggestions: RichSuggestion[] = [];
    const terminalStates = this.getTerminalStates();
    const now = Date.now();

    for (const state of terminalStates.values()) {
      suggestions.push(...this.evaluateErrorRules(state));

      if (this.canUseLevel('suggest')) {
        const idleSuggestion = this.evaluateIdleRule(state, now);
        if (idleSuggestion) {
          suggestions.push(idleSuggestion);
        }

        suggestions.push(...this.evaluateContextRule(state));
      }

      if (this.canUseLevel('coach')) {
        const testSuggestion = this.evaluateTestsRule(state);
        if (testSuggestion) {
          suggestions.push(testSuggestion);
        }

        const serverSuggestion = this.evaluateServerIdleRule(state, now);
        if (serverSuggestion) {
          suggestions.push(serverSuggestion);
        }
      }

      if (this.canUseLevel('act')) {
        const actionSuggestion = this.evaluateActRule(state);
        if (actionSuggestion) {
          suggestions.push(actionSuggestion);
        }
      }
    }

    if (this.canUseLevel('coach')) {
      const activeTerminalSuggestion = this.evaluateActiveTerminalCount(terminalStates.size);
      if (activeTerminalSuggestion) {
        suggestions.push(activeTerminalSuggestion);
      }
    }

    for (const suggestion of suggestions) {
      if (!this.shouldEmit(suggestion)) {
        continue;
      }

      this.onSuggestion(suggestion);
    }

    return suggestions;
  }

  public onEvent(event: TerminalEvent): void {
    if (event.type === 'error') {
      const immediateSuggestion = createSuggestion({
        title: `${event.terminalId} meldet Fehler`,
        description: event.summary,
        priority: 'high',
        category: 'error',
        terminalId: event.terminalId,
        actions: [
          { type: 'focus-terminal', label: 'Öffnen', payload: event.terminalId },
          { type: 'dismiss', label: 'Ignorieren' },
        ],
      });

      if (this.shouldEmit(immediateSuggestion)) {
        this.onSuggestion(immediateSuggestion);
      }
    }

    if (event.type === 'context_warning' && this.canUseLevel('suggest')) {
      const suggestion = createSuggestion({
        title: `${event.terminalId} Kontext-Warnung`,
        description: event.summary,
        priority: 'high',
        category: 'context',
        terminalId: event.terminalId,
        actions: [
          { type: 'new-terminal', label: 'Neues Terminal' },
          { type: 'dismiss', label: 'Ignorieren' },
        ],
      });

      if (this.shouldEmit(suggestion)) {
        this.onSuggestion(suggestion);
      }
    }

    if (event.type === 'waiting' && this.canUseLevel('suggest')) {
      const prompt = extractWaitingPrompt(event);
      const hint = this.buildWaitingResponseHint(event);
      const description = hint
        ? `${prompt} Vorschlag: ${hint}`
        : prompt;

      const suggestion = createSuggestion({
        title: `${event.terminalId} wartet auf Input`,
        description,
        priority: 'high',
        category: 'workflow',
        terminalId: event.terminalId,
        actions: [
          { type: 'focus-terminal', label: 'Öffnen', payload: event.terminalId },
          { type: 'dismiss', label: 'Ignorieren' },
        ],
      });

      if (this.shouldEmit(suggestion)) {
        this.onSuggestion(suggestion);
      }
    }

    if (event.type === 'error') {
      this.evaluate();
    }
  }

  public buildWaitingResponseHint(event: TerminalEvent): string | null {
    const prompt = extractWaitingPrompt(event);

    if (ENTER_PROMPT_REGEX.test(prompt)) {
      return 'Enter senden, wenn dieser Schritt erwartet ist.';
    }

    if (YES_NO_PROMPT_REGEX.test(prompt)) {
      if (DESTRUCTIVE_PROMPT_REGEX.test(prompt)) {
        return 'Eher mit "n" abbrechen und erst Befehl oder Diff prüfen.';
      }

      if (SAFE_CONTINUE_PROMPT_REGEX.test(prompt)) {
        return 'Mit "y" nur bestätigen, wenn der Schritt wirklich erwartet ist.';
      }

      return 'Antwort bewusst prüfen, bevor du bestätigst.';
    }

    return null;
  }

  public dispose(): void {
    this.stop();
    this.lastSuggestionAt.clear();
  }

  private evaluateErrorRules(state: TerminalState): RichSuggestion[] {
    const suggestions: RichSuggestion[] = [];

    const repeatedErrors = this.db.prepare(
      `SELECT e.summary, COUNT(*) AS count
       FROM session_events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.terminal_id = ?
         AND e.event_type = 'error'
         AND e.timestamp >= ?
       GROUP BY e.summary
       HAVING COUNT(*) > 3`,
    ).all(state.terminalId, Date.now() - (5 * 60 * 1000)) as EventSummaryRow[];

    const topRepeatedError = repeatedErrors[0];
    if (topRepeatedError) {
      suggestions.push(
        createSuggestion({
          title: `${state.terminalId} hat wiederholt Fehler`,
          description: `${topRepeatedError.summary} (${topRepeatedError.count}x in 5min)`,
          priority: 'high',
          category: 'error',
          terminalId: state.terminalId,
          actions: [
            { type: 'focus-terminal', label: 'Öffnen', payload: state.terminalId },
            { type: 'dismiss', label: 'Ignorieren' },
          ],
        }),
      );
    }

    if (state.status === 'exited') {
      const latestError = this.db.prepare(
        `SELECT e.summary, e.timestamp
         FROM session_events e
         JOIN sessions s ON s.id = e.session_id
         WHERE s.terminal_id = ? AND e.event_type = 'error'
         ORDER BY e.timestamp DESC
         LIMIT 1`,
      ).get(state.terminalId) as { summary: string; timestamp: number } | undefined;

      if (latestError && Date.now() - latestError.timestamp <= 10 * 60 * 1000) {
        suggestions.push(
          createSuggestion({
            title: `${state.terminalId} fehlgeschlagen`,
            description: latestError.summary,
            priority: 'critical',
            category: 'error',
            terminalId: state.terminalId,
            actions: [
              { type: 'focus-terminal', label: 'Öffnen', payload: state.terminalId },
              { type: 'dismiss', label: 'Ignorieren' },
            ],
          }),
        );
      }
    }

    return suggestions;
  }

  private evaluateIdleRule(state: TerminalState, now: number): RichSuggestion | null {
    if (state.status !== 'idle' && state.status !== 'active') {
      return null;
    }

    const idleMinutes = Math.floor((now - state.lastActivity) / 60_000);
    if (idleMinutes < 10) {
      return null;
    }

    return createSuggestion({
      title: `${state.terminalId} seit ${idleMinutes}min idle`,
      description: 'Terminal zeigt seit längerer Zeit keine Aktivität. Schließen?',
      priority: 'medium',
      category: 'idle',
      terminalId: state.terminalId,
      actions: [
        { type: 'close-terminal', label: 'Beenden', payload: state.terminalId },
        { type: 'dismiss', label: 'Ignorieren' },
      ],
    });
  }

  private evaluateContextRule(state: TerminalState): RichSuggestion[] {
    const rows = this.db.prepare(
      `SELECT e.event_type, e.summary, e.timestamp
       FROM session_events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.terminal_id = ?
         AND e.event_type = 'context_warning'
         AND e.timestamp >= ?
       ORDER BY e.timestamp DESC
       LIMIT 1`,
    ).all(state.terminalId, Date.now() - (10 * 60 * 1000)) as SimpleEventRow[];

    const contextEvent = rows[0];
    if (!contextEvent) {
      return [];
    }

    return [
      createSuggestion({
        title: `${state.terminalId} Kontext nahezu voll`,
        description: `${contextEvent.summary} — neuer Thread empfohlen.`,
        priority: 'high',
        category: 'context',
        terminalId: state.terminalId,
        actions: [
          { type: 'new-terminal', label: 'Neues Terminal' },
          { type: 'dismiss', label: 'Ignorieren' },
        ],
      }),
    ];
  }

  private evaluateTestsRule(state: TerminalState): RichSuggestion | null {
    const latestTestResult = this.db.prepare(
      `SELECT e.summary, e.timestamp
       FROM session_events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.terminal_id = ?
         AND e.event_type = 'test_result'
       ORDER BY e.timestamp DESC
       LIMIT 1`,
    ).get(state.terminalId) as { summary: string; timestamp: number } | undefined;

    if (!latestTestResult || !/PASS/i.test(latestTestResult.summary)) {
      return null;
    }

    return createSuggestion({
      title: `${state.terminalId} Tests bestanden`,
      description: 'Tests sind grün. Nächsten Schritt planen?',
      priority: 'low',
      category: 'workflow',
      terminalId: state.terminalId,
      actions: [
        { type: 'send-prompt', label: 'Nächsten Schritt fragen', payload: state.terminalId },
        { type: 'dismiss', label: 'Ignorieren' },
      ],
    });
  }

  private evaluateServerIdleRule(state: TerminalState, now: number): RichSuggestion | null {
    const latestServerStart = this.db.prepare(
      `SELECT e.summary, e.timestamp
       FROM session_events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.terminal_id = ?
         AND e.event_type = 'server_started'
       ORDER BY e.timestamp DESC
       LIMIT 1`,
    ).get(state.terminalId) as { summary: string; timestamp: number } | undefined;

    if (!latestServerStart) {
      return null;
    }

    const hoursSinceActivity = (now - state.lastActivity) / (60 * 60 * 1000);
    if (hoursSinceActivity < 2) {
      return null;
    }

    return createSuggestion({
      title: `Dev-Server in ${state.terminalId} läuft lange ohne Aktivität`,
      description: `${latestServerStart.summary}. Seit ${Math.floor(hoursSinceActivity)}h keine Aktivität.`,
      priority: 'low',
      category: 'idle',
      terminalId: state.terminalId,
      actions: [
        { type: 'focus-terminal', label: 'Öffnen', payload: state.terminalId },
        { type: 'dismiss', label: 'Ignorieren' },
      ],
    });
  }

  private evaluateActiveTerminalCount(totalTerminals: number): RichSuggestion | null {
    if (totalTerminals <= 5) {
      return null;
    }

    return createSuggestion({
      title: 'Viele Terminals aktiv',
      description: `${totalTerminals} aktive Sessions erkannt. Fokus setzen?`,
      priority: 'medium',
      category: 'workflow',
      actions: [
        { type: 'dismiss', label: 'Später' },
      ],
    });
  }

  private evaluateActRule(state: TerminalState): RichSuggestion | null {
    const latestError = this.db.prepare(
      `SELECT e.summary, e.timestamp
       FROM session_events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.terminal_id = ?
         AND e.event_type = 'error'
       ORDER BY e.timestamp DESC
       LIMIT 1`,
    ).get(state.terminalId) as { summary: string; timestamp: number } | undefined;

    if (!latestError || Date.now() - latestError.timestamp > 5 * 60 * 1000) {
      return null;
    }

    return createSuggestion({
      title: `Fehler in ${state.terminalId} analysieren?`,
      description: latestError.summary,
      priority: 'high',
      category: 'error',
      terminalId: state.terminalId,
      actions: [
        { type: 'send-prompt', label: 'Analysieren', payload: state.terminalId },
        { type: 'dismiss', label: 'Ignorieren' },
      ],
    });
  }

  private canUseLevel(level: CoachingLevel): boolean {
    return levelPriority[this.coachingLevel] >= levelPriority[level];
  }

  private shouldEmit(suggestion: RichSuggestion): boolean {
    if (this.coachingLevel === 'observe' && suggestion.priority !== 'critical' && suggestion.priority !== 'high') {
      return false;
    }

    const key = `${suggestion.terminalId ?? 'global'}:${suggestion.category}:${suggestion.title}`;
    const lastTimestamp = this.lastSuggestionAt.get(key) ?? 0;
    if (Date.now() - lastTimestamp < COOLDOWN_MS) {
      return false;
    }

    this.lastSuggestionAt.set(key, Date.now());
    return true;
  }
}
