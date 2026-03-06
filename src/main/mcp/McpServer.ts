import type BetterSqlite3 from 'better-sqlite3';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type CallToolResult,
  type Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { EventType } from '../../shared/types/event';
import { detectAgentType } from '../../common/agent/detectAgentType';
import { isObjectRecord } from '../utils/typeGuards';

const DEFAULT_ERROR_WINDOW_MINUTES = 30;
const DEFAULT_CHANGE_WINDOW_MINUTES = 30;
const DEFAULT_HOT_WINDOW_MINUTES = 5;
const DEFAULT_CONTEXT_WINDOW_MINUTES = 10;
const MAX_LIST_ITEMS = 200;

const EVENT_PRIORITY: Record<EventType, number> = {
  error: 5,
  warning: 4,
  context_warning: 3,
  test_result: 2,
  waiting: 1,
  server_started: 0,
};

type ToolName =
  | 'get_terminal_status'
  | 'get_terminal_errors'
  | 'get_workspace_context'
  | 'get_file_conflicts'
  | 'get_recent_changes'
  | 'get_hot_events';

interface TerminalStatusRow {
  terminal_id: string;
  label_prefix: string;
  label_index: number;
  status: string;
  shell: string | null;
  last_activity: number;
}

interface TerminalStatusItem {
  terminalId: string;
  label: string;
  status: string;
  agentType: string;
  lastActivity: number;
}

interface TerminalErrorRow {
  terminal_id: string;
  summary: string;
  details: string | null;
  timestamp: number;
}

interface TerminalErrorItem {
  terminalId: string;
  summary: string;
  detail: string;
  timestamp: number;
}

interface FileConflictRow {
  file_path: string;
  terminal_ids: string;
  detected_at: number;
}

interface FileConflictItem {
  filePath: string;
  terminalIds: string[];
  detectedAt: number;
}

interface FileChangeRow {
  file_path: string;
  terminal_id: string;
  timestamp: number;
  change_type: string;
}

interface RecentChangeItem {
  filePath: string;
  terminalId: string;
  timestamp: number;
  changeType: 'create' | 'modify' | 'delete';
}

interface HotEventRow {
  terminal_id: string;
  event_type: string;
  summary: string;
  details: string | null;
  timestamp: number;
}

interface HotEventItem {
  terminalId: string;
  type: EventType;
  summary: string;
  detail: string;
  timestamp: number;
}

interface WorkspaceIdRow {
  id: string;
}

interface ActiveWorkspaceRow {
  workspace_id: string;
}

type ToolInputSchema = Tool['inputSchema'] & {
  type: 'object';
  properties?: Record<string, object>;
  required?: string[];
};

interface ToolDefinition extends Tool {
  name: ToolName;
  inputSchema: ToolInputSchema;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_terminal_status',
    description: 'Liefert den Status aller Terminals im Workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Optional: Workspace-ID. Standard ist der aktive Workspace.',
        },
      },
    },
  },
  {
    name: 'get_terminal_errors',
    description: 'Liefert aktuelle Error-Events aus allen oder einem Terminal.',
    inputSchema: {
      type: 'object',
      properties: {
        terminalId: {
          type: 'string',
          description: 'Optional: Nur Errors dieses Terminals.',
        },
        since_minutes: {
          type: 'number',
          description: 'Optional: Zeitfenster in Minuten (Default: 30).',
        },
      },
    },
  },
  {
    name: 'get_workspace_context',
    description: 'Liefert einen kompakten Kontext-String zur Prompt-Anreicherung.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Optional: Workspace-ID. Standard ist der aktive Workspace.',
        },
      },
    },
  },
  {
    name: 'get_file_conflicts',
    description: 'Liefert aktuelle Datei-Konflikte (mehrere Terminals je Datei).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_recent_changes',
    description: 'Liefert kürzlich geänderte Dateien.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Optional: Exakter Filter auf einen Dateipfad.',
        },
        since_minutes: {
          type: 'number',
          description: 'Optional: Zeitfenster in Minuten (Default: 30).',
        },
      },
    },
  },
  {
    name: 'get_hot_events',
    description: 'Liefert priorisierte Events (Error > Warning > Info) der letzten Minuten.',
    inputSchema: {
      type: 'object',
      properties: {
        minutes: {
          type: 'number',
          description: 'Optional: Zeitfenster in Minuten (Default: 5).',
        },
        workspaceId: {
          type: 'string',
          description: 'Optional: Workspace-ID.',
        },
      },
    },
  },
];

const parseToolArguments = (value: unknown): Record<string, unknown> => {
  if (!isObjectRecord(value)) {
    return {};
  }

  return value;
};

const readOptionalString = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

const readOptionalNumber = (args: Record<string, unknown>, key: string): number | undefined => {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const normalizeMinutes = (value: number | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }

  if (value < 1) {
    return 1;
  }

  return Math.floor(value);
};

const toEventType = (eventType: string): EventType => {
  if (
    eventType === 'error'
    || eventType === 'warning'
    || eventType === 'test_result'
    || eventType === 'server_started'
    || eventType === 'context_warning'
    || eventType === 'waiting'
  ) {
    return eventType;
  }

  return 'warning';
};

const toChangeType = (changeType: string): 'create' | 'modify' | 'delete' => {
  if (changeType === 'create' || changeType === 'modify' || changeType === 'delete') {
    return changeType;
  }

  return 'modify';
};

const toStructuredContent = (payload: unknown): Record<string, unknown> => {
  if (isObjectRecord(payload)) {
    return payload;
  }

  return { result: payload };
};

const createSuccessResult = (payload: unknown): CallToolResult => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: toStructuredContent(payload),
  };
};

const createErrorResult = (message: string): CallToolResult => {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
};

const formatAge = (timestamp: number): string => {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes <= 0) {
    return 'gerade eben';
  }

  if (minutes === 1) {
    return 'vor 1min';
  }

  return `vor ${minutes}min`;
};

export class McpToolService {
  private readonly hasFileChangesTable: boolean;

  public constructor(private readonly db: BetterSqlite3.Database) {
    this.hasFileChangesTable = this.tableExists('file_changes');
  }

  public getTerminalStatus(params: { workspaceId?: string } = {}): TerminalStatusItem[] {
    const workspaceId = this.resolveWorkspaceId(params.workspaceId);
    if (!workspaceId) {
      return [];
    }

    const rows = this.db
      .prepare(
        `WITH ranked_sessions AS (
           SELECT
             s.*,
             ROW_NUMBER() OVER (PARTITION BY s.terminal_id ORDER BY s.created_at DESC) AS row_num
           FROM sessions s
           WHERE s.workspace_id = ?
         )
         SELECT
           rs.terminal_id,
           rs.label_prefix,
           rs.label_index,
           rs.status,
           rs.shell,
           COALESCE(MAX(e.timestamp), rs.created_at) AS last_activity
         FROM ranked_sessions rs
         LEFT JOIN session_events e ON e.session_id = rs.id
         WHERE rs.row_num = 1
         GROUP BY rs.id
         ORDER BY last_activity DESC
         LIMIT ?`,
      )
      .all(workspaceId, MAX_LIST_ITEMS) as TerminalStatusRow[];

    return rows.map((row) => ({
      terminalId: row.terminal_id,
      label: `${row.label_prefix}${row.label_index}`,
      status: row.status,
      agentType: detectAgentType(row.shell),
      lastActivity: row.last_activity,
    }));
  }

  public getTerminalErrors(params: {
    terminalId?: string;
    sinceMinutes?: number;
  } = {}): TerminalErrorItem[] {
    const sinceMinutes = normalizeMinutes(params.sinceMinutes, DEFAULT_ERROR_WINDOW_MINUTES);
    const since = Date.now() - (sinceMinutes * 60_000);

    const terminalFilter = params.terminalId ? 'AND s.terminal_id = ?' : '';
    const bindParams: unknown[] = [since];
    if (params.terminalId) {
      bindParams.push(params.terminalId);
    }
    bindParams.push(MAX_LIST_ITEMS);

    const rows = this.db
      .prepare(
        `SELECT s.terminal_id, e.summary, e.details, e.timestamp
         FROM session_events e
         JOIN sessions s ON s.id = e.session_id
         WHERE e.event_type = 'error'
           AND e.timestamp >= ?
           ${terminalFilter}
         ORDER BY e.timestamp DESC
         LIMIT ?`,
      )
      .all(...bindParams) as TerminalErrorRow[];

    return rows.map((row) => ({
      terminalId: row.terminal_id,
      summary: row.summary,
      detail: row.details ?? '',
      timestamp: row.timestamp,
    }));
  }

  public getWorkspaceContext(params: { workspaceId?: string } = {}): string {
    const workspaceId = this.resolveWorkspaceId(params.workspaceId);
    if (!workspaceId) {
      return 'Keine aktiven Events';
    }

    const hotEvents = this.getHotEvents({
      minutes: DEFAULT_CONTEXT_WINDOW_MINUTES,
      workspaceId,
    });
    const conflicts = this.queryFileConflicts(workspaceId);

    if (hotEvents.length === 0 && conflicts.length === 0) {
      return 'Keine aktiven Events';
    }

    const errors = hotEvents.filter((event) => event.type === 'error').slice(0, 3);
    const warnings = hotEvents.filter((event) => event.type === 'warning').slice(0, 2);
    const contextWarnings = hotEvents.filter((event) => event.type === 'context_warning').slice(0, 2);

    const parts: string[] = [];

    if (errors.length > 0) {
      parts.push(
        `Aktive Fehler: ${errors
          .map((event) => `${event.terminalId} ${event.summary} (${formatAge(event.timestamp)})`)
          .join(' | ')}`,
      );
    }

    if (warnings.length > 0) {
      parts.push(
        `Warnings: ${warnings
          .map((event) => `${event.terminalId} ${event.summary} (${formatAge(event.timestamp)})`)
          .join(' | ')}`,
      );
    }

    if (contextWarnings.length > 0) {
      parts.push(
        `Kontext: ${contextWarnings
          .map((event) => `${event.terminalId} ${event.summary} (${formatAge(event.timestamp)})`)
          .join(' | ')}`,
      );
    }

    if (conflicts.length > 0) {
      const firstConflict = conflicts[0];
      if (firstConflict) {
        parts.push(`Konflikt: ${firstConflict.filePath} (${firstConflict.terminalIds.join(', ')})`);
      }
    }

    return parts.join('. ');
  }

  public getFileConflicts(): FileConflictItem[] {
    return this.queryFileConflicts();
  }

  public getRecentChanges(params: {
    filePath?: string;
    sinceMinutes?: number;
  } = {}): RecentChangeItem[] {
    const sinceMinutes = normalizeMinutes(params.sinceMinutes, DEFAULT_CHANGE_WINDOW_MINUTES);
    const since = Date.now() - (sinceMinutes * 60_000);

    const fileFilter = params.filePath ? 'AND file_path = ?' : '';
    const bindParams: unknown[] = [since];
    if (params.filePath) {
      bindParams.push(params.filePath);
    }
    bindParams.push(MAX_LIST_ITEMS);

    if (this.hasFileChangesTable) {
      const rows = this.db
        .prepare(
          `SELECT file_path, terminal_id, timestamp, change_type
           FROM file_changes
           WHERE timestamp >= ? ${fileFilter}
           ORDER BY timestamp DESC
           LIMIT ?`,
        )
        .all(...bindParams) as FileChangeRow[];

      return rows.map((row) => ({
        filePath: row.file_path,
        terminalId: row.terminal_id,
        timestamp: row.timestamp,
        changeType: toChangeType(row.change_type),
      }));
    }

    const rows = this.db
      .prepare(
        `SELECT file_path, terminal_id, locked_at AS timestamp
         FROM file_locks
         WHERE locked_at >= ? ${fileFilter}
         ORDER BY locked_at DESC
         LIMIT ?`,
      )
      .all(...bindParams) as Array<{
      file_path: string;
      terminal_id: string;
      timestamp: number;
    }>;

    return rows.map((row) => ({
      filePath: row.file_path,
      terminalId: row.terminal_id,
      timestamp: row.timestamp,
      changeType: 'modify',
    }));
  }

  public getHotEvents(params: { minutes?: number; workspaceId?: string } = {}): HotEventItem[] {
    const minutes = normalizeMinutes(params.minutes, DEFAULT_HOT_WINDOW_MINUTES);
    const since = Date.now() - (minutes * 60_000);

    if (params.workspaceId) {
      const workspaceId = this.resolveWorkspaceId(params.workspaceId);
      if (!workspaceId) {
        return [];
      }

      const rows = this.db
        .prepare(
          `SELECT s.terminal_id, e.event_type, e.summary, e.details, e.timestamp
           FROM session_events e
           JOIN sessions s ON s.id = e.session_id
           WHERE s.workspace_id = ? AND e.timestamp >= ?
           ORDER BY e.timestamp DESC
           LIMIT ?`,
        )
        .all(workspaceId, since, MAX_LIST_ITEMS) as HotEventRow[];

      return this.sortHotEvents(rows);
    }

    const rows = this.db
      .prepare(
        `SELECT s.terminal_id, e.event_type, e.summary, e.details, e.timestamp
         FROM session_events e
         JOIN sessions s ON s.id = e.session_id
         WHERE e.timestamp >= ?
         ORDER BY e.timestamp DESC
         LIMIT ?`,
      )
      .all(since, MAX_LIST_ITEMS) as HotEventRow[];

    return this.sortHotEvents(rows);
  }

  private sortHotEvents(rows: HotEventRow[]): HotEventItem[] {
    const mapped = rows.map((row) => {
      const type = toEventType(row.event_type);
      return {
        terminalId: row.terminal_id,
        type,
        summary: row.summary,
        detail: row.details ?? '',
        timestamp: row.timestamp,
      };
    });

    return mapped.sort((left, right) => {
      const priorityDiff = EVENT_PRIORITY[right.type] - EVENT_PRIORITY[left.type];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return right.timestamp - left.timestamp;
    });
  }

  private queryFileConflicts(workspaceId?: string): FileConflictItem[] {
    if (workspaceId) {
      const rows = this.db
        .prepare(
          `SELECT file_path, GROUP_CONCAT(terminal_id, ',') AS terminal_ids, MAX(locked_at) AS detected_at
           FROM file_locks
           WHERE workspace_id = ?
           GROUP BY file_path
           HAVING COUNT(DISTINCT terminal_id) > 1
           ORDER BY detected_at DESC`,
        )
        .all(workspaceId) as FileConflictRow[];

      return rows.map((row) => ({
        filePath: row.file_path,
        terminalIds: row.terminal_ids
          .split(',')
          .map((terminalId) => terminalId.trim())
          .filter((terminalId) => terminalId.length > 0),
        detectedAt: row.detected_at,
      }));
    }

    const rows = this.db
      .prepare(
        `SELECT file_path, GROUP_CONCAT(terminal_id, ',') AS terminal_ids, MAX(locked_at) AS detected_at
         FROM file_locks
         GROUP BY file_path
         HAVING COUNT(DISTINCT terminal_id) > 1
         ORDER BY detected_at DESC`,
      )
      .all() as FileConflictRow[];

    return rows.map((row) => ({
      filePath: row.file_path,
      terminalIds: row.terminal_ids
        .split(',')
        .map((terminalId) => terminalId.trim())
        .filter((terminalId) => terminalId.length > 0),
      detectedAt: row.detected_at,
    }));
  }

  private resolveWorkspaceId(workspaceId?: string): string | null {
    if (workspaceId) {
      const row = this.db
        .prepare('SELECT id FROM workspaces WHERE id = ? LIMIT 1')
        .get(workspaceId) as WorkspaceIdRow | undefined;

      return row?.id ?? null;
    }

    const activeWorkspace = this.db
      .prepare(
        `SELECT workspace_id
         FROM sessions
         WHERE status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get() as ActiveWorkspaceRow | undefined;

    if (activeWorkspace?.workspace_id) {
      return activeWorkspace.workspace_id;
    }

    const latestWorkspace = this.db
      .prepare(
        `SELECT id
         FROM workspaces
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get() as WorkspaceIdRow | undefined;

    return latestWorkspace?.id ?? null;
  }

  private tableExists(tableName: string): boolean {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName) as { name: string } | undefined;

    return typeof row?.name === 'string';
  }
}

export const createMcpServer = (db: BetterSqlite3.Database): Server => {
  const toolService = new McpToolService(db);
  const server = new Server(
    {
      name: 'tmaster',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOL_DEFINITIONS,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const toolName = request.params.name;
      const args = parseToolArguments(request.params.arguments);

      if (toolName === 'get_terminal_status') {
        return createSuccessResult({
          terminals: toolService.getTerminalStatus({
            workspaceId: readOptionalString(args, 'workspaceId'),
          }),
        });
      }

      if (toolName === 'get_terminal_errors') {
        return createSuccessResult({
          errors: toolService.getTerminalErrors({
            terminalId: readOptionalString(args, 'terminalId'),
            sinceMinutes: readOptionalNumber(args, 'since_minutes'),
          }),
        });
      }

      if (toolName === 'get_workspace_context') {
        return createSuccessResult({
          context: toolService.getWorkspaceContext({
            workspaceId: readOptionalString(args, 'workspaceId'),
          }),
        });
      }

      if (toolName === 'get_file_conflicts') {
        return createSuccessResult({
          conflicts: toolService.getFileConflicts(),
        });
      }

      if (toolName === 'get_recent_changes') {
        return createSuccessResult({
          changes: toolService.getRecentChanges({
            filePath: readOptionalString(args, 'file_path'),
            sinceMinutes: readOptionalNumber(args, 'since_minutes'),
          }),
        });
      }

      if (toolName === 'get_hot_events') {
        return createSuccessResult({
          events: toolService.getHotEvents({
            minutes: readOptionalNumber(args, 'minutes'),
            workspaceId: readOptionalString(args, 'workspaceId'),
          }),
        });
      }

      return createErrorResult(`Unknown tool: ${toolName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Tool execution failed: ${message}`);
    }
  });

  return server;
};

export const startMcpServer = async (db: BetterSqlite3.Database): Promise<void> => {
  const server = createMcpServer(db);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
