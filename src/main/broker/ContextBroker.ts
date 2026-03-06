import type BetterSqlite3 from 'better-sqlite3';
import type { ContextQuery, ContextResult, FileConflict } from '../../shared/types/broker';
import type { EventType, TerminalEvent } from '../../shared/types/event';
import { getConflictingFiles } from '../db/queries';

interface EventQueryRow {
  timestamp: number;
  event_type: string;
  summary: string;
  details: string | null;
  terminal_id: string;
}

interface ActiveCountRow {
  count: number;
}

interface ErrorCountRow {
  count: number;
}

interface WorkspaceRow {
  workspace_id: string;
}

interface GlobalConflictRow {
  workspace_id: string;
  file_path: string;
  terminal_ids: string;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_HOT_WINDOW_MINUTES = 5;
const MAX_HOT_EVENTS_PER_WORKSPACE = 500;

const EVENT_PRIORITY: Record<EventType, number> = {
  error: 5,
  warning: 4,
  context_warning: 3,
  test_result: 2,
  waiting: 1,
  server_started: 0,
};

const isEventType = (value: string): value is EventType => {
  return (
    value === 'error'
    || value === 'warning'
    || value === 'test_result'
    || value === 'server_started'
    || value === 'context_warning'
    || value === 'waiting'
  );
};

const toTerminalEvent = (row: EventQueryRow): TerminalEvent => {
  const eventType = isEventType(row.event_type) ? row.event_type : 'warning';
  return {
    terminalId: row.terminal_id,
    timestamp: row.timestamp,
    type: eventType,
    summary: row.summary,
    details: row.details ?? undefined,
    source: 'pattern',
  };
};

export class ContextBroker {
  private readonly hotEventsByWorkspace = new Map<string, TerminalEvent[]>();

  public constructor(private readonly db: BetterSqlite3.Database) {}

  public getContext(query: ContextQuery): ContextResult {
    const now = Date.now();
    const since = query.since ?? 0;
    const limit = Math.max(1, query.limit ?? DEFAULT_LIMIT);

    const eventRows = this.queryEvents(query, since, limit);
    const events = eventRows.map(toTerminalEvent);

    const activeTerminals = this.queryActiveTerminals(query.workspaceId);
    const recentErrors = this.queryRecentErrorCount(query, now - (5 * 60 * 1000));
    const conflicts = this.queryConflicts(query.workspaceId);

    return {
      events,
      activeTerminals,
      recentErrors,
      conflicts,
    };
  }

  public buildPromptContext(workspaceId: string): string {
    const context = this.getContext({
      workspaceId,
      since: Date.now() - (10 * 60 * 1000),
      limit: 30,
    });

    if (context.events.length === 0 && context.conflicts.length === 0) {
      return 'Keine relevanten Terminal-Ereignisse im letzten Zeitraum.';
    }

    const errors = context.events.filter((event) => event.type === 'error').slice(0, 3);
    const warnings = context.events.filter((event) => event.type === 'warning').slice(0, 2);
    const contextWarnings = context.events.filter((event) => event.type === 'context_warning').slice(0, 2);

    const parts: string[] = [];

    if (errors.length > 0) {
      parts.push(`Aktive Fehler: ${errors.map((event) => `${event.terminalId} ${event.summary}`).join(' | ')}`);
    }

    if (warnings.length > 0) {
      parts.push(`Warnings: ${warnings.map((event) => `${event.terminalId} ${event.summary}`).join(' | ')}`);
    }

    if (contextWarnings.length > 0) {
      parts.push(`Kontext: ${contextWarnings.map((event) => `${event.terminalId} ${event.summary}`).join(' | ')}`);
    }

    if (context.conflicts.length > 0) {
      const conflict = context.conflicts[0];
      if (conflict) {
        parts.push(`Konflikt: ${conflict.filePath} (${conflict.terminalIds.join(', ')})`);
      }
    }

    return parts.join('. ');
  }

  public onEvent(event: TerminalEvent): void {
    const workspaceId = this.findWorkspaceIdByTerminal(event.terminalId);
    if (!workspaceId) {
      return;
    }

    const existing = this.hotEventsByWorkspace.get(workspaceId) ?? [];
    existing.push(event);

    // Evict alte Events und begrenze Speicherverbrauch
    const cutoff = Date.now() - (30 * 60 * 1000);
    const filtered = existing.filter((item) => item.timestamp >= cutoff);
    const bounded = filtered.length > MAX_HOT_EVENTS_PER_WORKSPACE
      ? filtered.slice(-MAX_HOT_EVENTS_PER_WORKSPACE)
      : filtered;
    this.hotEventsByWorkspace.set(workspaceId, bounded);
  }

  public getHotEvents(workspaceId: string, minutes: number = DEFAULT_HOT_WINDOW_MINUTES): TerminalEvent[] {
    const since = Date.now() - (Math.max(1, minutes) * 60 * 1000);
    const fromMemory = (this.hotEventsByWorkspace.get(workspaceId) ?? [])
      .filter((event) => event.timestamp >= since);

    if (fromMemory.length > 0) {
      return [...fromMemory].sort((a, b) => {
        const priorityDiff = EVENT_PRIORITY[b.type] - EVENT_PRIORITY[a.type];
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return b.timestamp - a.timestamp;
      });
    }

    const rows = this.db.prepare(
      `SELECT e.timestamp, e.event_type, e.summary, e.details, s.terminal_id
       FROM session_events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.workspace_id = ? AND e.timestamp >= ?
       ORDER BY e.timestamp DESC
       LIMIT 200`,
    ).all(workspaceId, since) as EventQueryRow[];

    return rows
      .map(toTerminalEvent)
      .sort((a, b) => {
        const priorityDiff = EVENT_PRIORITY[b.type] - EVENT_PRIORITY[a.type];
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return b.timestamp - a.timestamp;
      });
  }

  private queryEvents(query: ContextQuery, since: number, limit: number): EventQueryRow[] {
    const whereClauses: string[] = ['e.timestamp >= ?'];
    const params: Array<number | string> = [since];

    if (query.workspaceId) {
      whereClauses.push('s.workspace_id = ?');
      params.push(query.workspaceId);
    }

    if (query.terminalId) {
      whereClauses.push('s.terminal_id = ?');
      params.push(query.terminalId);
    }

    if (query.eventTypes && query.eventTypes.length > 0) {
      const placeholders = query.eventTypes.map(() => '?').join(', ');
      whereClauses.push(`e.event_type IN (${placeholders})`);
      params.push(...query.eventTypes);
    }

    const statement = this.db.prepare(
      `SELECT e.timestamp, e.event_type, e.summary, e.details, s.terminal_id
       FROM session_events e
       JOIN sessions s ON s.id = e.session_id
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY e.timestamp DESC
       LIMIT ?`,
    );

    return statement.all(...params, limit) as EventQueryRow[];
  }

  private queryActiveTerminals(workspaceId?: string): number {
    if (workspaceId) {
      const row = this.db.prepare(
        "SELECT COUNT(*) AS count FROM sessions WHERE status = 'active' AND workspace_id = ?",
      ).get(workspaceId) as ActiveCountRow | undefined;

      return row?.count ?? 0;
    }

    const row = this.db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE status = 'active'").get() as ActiveCountRow | undefined;
    return row?.count ?? 0;
  }

  private queryRecentErrorCount(query: ContextQuery, since: number): number {
    const whereClauses: string[] = ["e.event_type = 'error'", 'e.timestamp >= ?'];
    const params: Array<number | string> = [since];

    if (query.workspaceId) {
      whereClauses.push('s.workspace_id = ?');
      params.push(query.workspaceId);
    }

    if (query.terminalId) {
      whereClauses.push('s.terminal_id = ?');
      params.push(query.terminalId);
    }

    const row = this.db.prepare(
      `SELECT COUNT(*) AS count
       FROM session_events e
       JOIN sessions s ON s.id = e.session_id
       WHERE ${whereClauses.join(' AND ')}`,
    ).get(...params) as ErrorCountRow | undefined;

    return row?.count ?? 0;
  }

  private queryConflicts(workspaceId?: string): FileConflict[] {
    if (workspaceId) {
      return getConflictingFiles(this.db, workspaceId).map((row) => ({
        filePath: row.file_path,
        terminalIds: row.terminal_ids.split(',').filter((terminalId) => terminalId.length > 0),
        detectedAt: Date.now(),
      }));
    }

    const rows = this.db.prepare(
      `SELECT workspace_id, file_path, GROUP_CONCAT(terminal_id, ',') AS terminal_ids
       FROM file_locks
       GROUP BY workspace_id, file_path
       HAVING COUNT(DISTINCT terminal_id) > 1`,
    ).all() as GlobalConflictRow[];

    return rows.map((row) => ({
      filePath: row.file_path,
      terminalIds: row.terminal_ids.split(',').filter((terminalId) => terminalId.length > 0),
      detectedAt: Date.now(),
    }));
  }

  private findWorkspaceIdByTerminal(terminalId: string): string | null {
    const row = this.db.prepare(
      "SELECT workspace_id FROM sessions WHERE terminal_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    ).get(terminalId) as WorkspaceRow | undefined;

    return row?.workspace_id ?? null;
  }
}
