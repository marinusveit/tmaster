import { randomUUID } from 'node:crypto';
import { Notification } from 'electron';
import type BetterSqlite3 from 'better-sqlite3';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type {
  AppNotification,
  NotificationAction,
  NotificationLevel,
  NotificationReplyRequest,
} from '../../shared/types/notification';
import type { TerminalEvent } from '../../shared/types/event';
import {
  insertNotification,
  listUnreadNotifications,
  markNotificationRead,
  type NotificationRow,
} from '../db/queries';

interface NotifyParams {
  title: string;
  body: string;
  level: NotificationLevel;
  terminalId?: string;
  workspaceId?: string;
  action?: NotificationAction;
}

interface TerminalNotificationContext {
  displayName?: string;
  workspaceId?: string;
}

interface WaitingNotificationSnapshot {
  key: string;
  timestamp: number;
}

const DESKTOP_RATE_LIMIT_MS = 30_000;
const WAITING_NOTIFICATION_COOLDOWN_MS = 30_000;
const GENERIC_WAITING_SUMMARY_REGEX = /^(?:⏳\s*)?waiting\s+for\s+input$/i;
const WAITING_MARKER_REGEX = /waiting\s+for\s+input|⏳/i;
const ANSI_ESCAPE_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

const parseContextPercentage = (summary: string): number | null => {
  const match = summary.match(/(\d+)%/);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toAppNotification = (row: NotificationRow): AppNotification => {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    level: row.level as NotificationLevel,
    terminalId: row.terminal_id ?? undefined,
    workspaceId: row.workspace_id ?? undefined,
    timestamp: row.timestamp,
    isRead: row.is_read === 1,
  };
};

const stripAnsi = (value: string): string => {
  return value.replace(ANSI_ESCAPE_REGEX, '');
};

const extractWaitingPrompt = (event: Pick<TerminalEvent, 'summary' | 'details'>): string => {
  const summary = stripAnsi(event.summary.trim());
  if (summary.length > 0 && !GENERIC_WAITING_SUMMARY_REGEX.test(summary) && !WAITING_MARKER_REGEX.test(summary)) {
    return summary;
  }

  const lines = event.details
    ?.split(/\r?\n/)
    .map((line) => stripAnsi(line).trim())
    .filter((line) => line.length > 0) ?? [];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line && !GENERIC_WAITING_SUMMARY_REGEX.test(line) && !WAITING_MARKER_REGEX.test(line)) {
      return line;
    }
  }

  return summary.length > 0 && !GENERIC_WAITING_SUMMARY_REGEX.test(summary)
    ? summary
    : 'Wartet auf Input';
};

const readActionIndex = (value: unknown): number | null => {
  if (typeof value !== 'object' || value === null || !('actionIndex' in value)) {
    return null;
  }

  const actionIndex = value.actionIndex;
  return typeof actionIndex === 'number' ? actionIndex : null;
};

export class NotificationManager {
  private readonly desktopRateLimit = new Map<string, number>();
  private readonly lastWaitingNotificationByTerminal = new Map<string, WaitingNotificationSnapshot>();

  public constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly broadcast: (channel: string, payload: unknown) => void,
    private readonly isWindowFocused: () => boolean,
    private readonly focusMainWindow: () => void,
    private readonly getTerminalContext?: (terminalId: string) => TerminalNotificationContext | undefined,
    private readonly getWaitingResponseHint?: (event: TerminalEvent) => string | null,
    private readonly onReplyRequested?: (request: NotificationReplyRequest) => void,
  ) {}

  public notify(params: NotifyParams): AppNotification {
    const notification: AppNotification = {
      id: randomUUID(),
      title: params.title,
      body: params.body,
      level: params.level,
      terminalId: params.terminalId,
      workspaceId: params.workspaceId,
      timestamp: Date.now(),
      isRead: false,
      action: params.action,
    };

    insertNotification(this.db, {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      level: notification.level,
      terminal_id: notification.terminalId ?? null,
      workspace_id: notification.workspaceId ?? null,
      timestamp: notification.timestamp,
      is_read: notification.isRead ? 1 : 0,
    });

    this.broadcast(IPC_CHANNELS.notificationShow, notification);
    this.maybeSendDesktopNotification(notification);
    return notification;
  }

  public onTerminalEvent(event: TerminalEvent): void {
    if (event.type !== 'waiting') {
      this.lastWaitingNotificationByTerminal.delete(event.terminalId);
    }

    const terminalContext = this.getTerminalContext?.(event.terminalId);
    const terminalName = terminalContext?.displayName ?? event.terminalId;

    if (event.type === 'error') {
      this.notify({
        title: `${terminalName} Fehler`,
        body: event.summary,
        level: 'error',
        terminalId: event.terminalId,
        workspaceId: terminalContext?.workspaceId,
      });
      return;
    }

    if (event.type === 'context_warning') {
      const contextPercent = parseContextPercentage(event.summary);
      if (contextPercent !== null && contextPercent > 80) {
        this.notify({
          title: `${terminalName} Kontext-Warnung`,
          body: event.summary,
          level: 'warning',
          terminalId: event.terminalId,
          workspaceId: terminalContext?.workspaceId,
        });
      }
      return;
    }

    if (event.type === 'test_result' && /FAIL/i.test(event.summary)) {
      this.notify({
        title: `${terminalName} Tests fehlgeschlagen`,
        body: event.summary,
        level: 'error',
        terminalId: event.terminalId,
        workspaceId: terminalContext?.workspaceId,
      });
      return;
    }

    if (event.type === 'server_started') {
      this.notify({
        title: `${terminalName} Server gestartet`,
        body: event.summary,
        level: 'success',
        terminalId: event.terminalId,
        workspaceId: terminalContext?.workspaceId,
      });
      return;
    }

    if (event.type === 'waiting') {
      const prompt = extractWaitingPrompt(event);
      const suggestion = this.getWaitingResponseHint?.(event) ?? null;
      const notificationKey = `${prompt}|${suggestion ?? ''}`;
      const previous = this.lastWaitingNotificationByTerminal.get(event.terminalId);

      if (
        previous
        && previous.key === notificationKey
        && event.timestamp - previous.timestamp < WAITING_NOTIFICATION_COOLDOWN_MS
      ) {
        return;
      }

      this.lastWaitingNotificationByTerminal.set(event.terminalId, {
        key: notificationKey,
        timestamp: event.timestamp,
      });

      const body = suggestion
        ? `${prompt}\nVorschlag: ${suggestion}`
        : prompt;

      this.notify({
        title: `${terminalName} wartet auf Input`,
        body,
        level: 'warning',
        terminalId: event.terminalId,
        workspaceId: terminalContext?.workspaceId,
        action: {
          label: 'Antworten',
          type: 'reply-terminal',
          payload: event.terminalId,
        },
      });
    }
  }

  public onTerminalExit(terminalId: string, exitCode: number): void {
    this.lastWaitingNotificationByTerminal.delete(terminalId);
    const terminalContext = this.getTerminalContext?.(terminalId);
    const terminalName = terminalContext?.displayName ?? terminalId;

    if (exitCode === 0) {
      this.notify({
        title: `${terminalName} fertig`,
        body: `${terminalName} wurde erfolgreich beendet.`,
        level: 'success',
        terminalId,
        workspaceId: terminalContext?.workspaceId,
      });
      return;
    }

    this.notify({
      title: `${terminalName} fehlgeschlagen`,
      body: `${terminalName} wurde mit Exit ${exitCode} beendet.`,
      level: 'error',
      terminalId,
      workspaceId: terminalContext?.workspaceId,
    });
  }

  public dismiss(notificationId: string): void {
    markNotificationRead(this.db, notificationId);
  }

  public getUnread(limit: number = 50): AppNotification[] {
    return listUnreadNotifications(this.db, limit).map(toAppNotification);
  }

  private maybeSendDesktopNotification(notification: AppNotification): void {
    if (!Notification.isSupported()) {
      return;
    }

    if (this.isWindowFocused()) {
      return;
    }

    const rateKey = notification.terminalId ?? 'global';
    const lastSent = this.desktopRateLimit.get(rateKey) ?? 0;
    if (notification.timestamp - lastSent < DESKTOP_RATE_LIMIT_MS) {
      return;
    }

    this.desktopRateLimit.set(rateKey, notification.timestamp);

    const isReplyNotification = notification.action?.type === 'reply-terminal' && typeof notification.terminalId === 'string';
    const desktopNotification = new Notification({
      title: notification.title,
      body: notification.body,
      actions: isReplyNotification
        ? [{ type: 'button', text: notification.action?.label ?? 'Antworten' }]
        : undefined,
    });

    desktopNotification.on('click', () => {
      this.focusMainWindow();
      if (isReplyNotification && notification.terminalId) {
        this.onReplyRequested?.({
          notificationId: notification.id,
          terminalId: notification.terminalId,
        });
      }
    });

    desktopNotification.on('action', (details) => {
      const actionIndex = readActionIndex(details);
      if (!isReplyNotification || !notification.terminalId || actionIndex !== 0) {
        return;
      }

      this.focusMainWindow();
      this.onReplyRequested?.({
        notificationId: notification.id,
        terminalId: notification.terminalId,
      });
    });

    desktopNotification.show();
  }
}
