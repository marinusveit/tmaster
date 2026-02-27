import { randomUUID } from 'node:crypto';
import { Notification } from 'electron';
import type BetterSqlite3 from 'better-sqlite3';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { AppNotification, NotificationLevel } from '@shared/types/notification';
import type { TerminalEvent } from '@shared/types/event';
import {
  insertNotification,
  listUnreadNotifications,
  markNotificationRead,
  type NotificationRow,
} from '@main/db/queries';

interface NotifyParams {
  title: string;
  body: string;
  level: NotificationLevel;
  terminalId?: string;
  workspaceId?: string;
}

const DESKTOP_RATE_LIMIT_MS = 30_000;

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

export class NotificationManager {
  private readonly desktopRateLimit = new Map<string, number>();
  private readonly waitingSince = new Map<string, number>();

  public constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly broadcast: (channel: string, payload: unknown) => void,
    private readonly isWindowFocused: () => boolean,
    private readonly focusMainWindow: () => void,
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
    if (event.type === 'error') {
      this.notify({
        title: `${event.terminalId} Fehler`,
        body: event.summary,
        level: 'error',
        terminalId: event.terminalId,
      });
      return;
    }

    if (event.type === 'context_warning') {
      const contextPercent = parseContextPercentage(event.summary);
      if (contextPercent !== null && contextPercent > 80) {
        this.notify({
          title: `${event.terminalId} Kontext-Warnung`,
          body: event.summary,
          level: 'warning',
          terminalId: event.terminalId,
        });
      }
      return;
    }

    if (event.type === 'test_result' && /FAIL/i.test(event.summary)) {
      this.notify({
        title: `${event.terminalId} Tests fehlgeschlagen`,
        body: event.summary,
        level: 'error',
        terminalId: event.terminalId,
      });
      return;
    }

    if (event.type === 'server_started') {
      this.notify({
        title: `${event.terminalId} Server gestartet`,
        body: event.summary,
        level: 'success',
        terminalId: event.terminalId,
      });
      return;
    }

    if (event.type === 'waiting') {
      const waitingStart = this.waitingSince.get(event.terminalId);
      if (!waitingStart) {
        this.waitingSince.set(event.terminalId, event.timestamp);
        return;
      }

      if (event.timestamp - waitingStart >= 120_000) {
        this.notify({
          title: `${event.terminalId} wartet auf Input`,
          body: event.summary,
          level: 'info',
          terminalId: event.terminalId,
        });
        this.waitingSince.set(event.terminalId, event.timestamp);
      }
    }
  }

  public onTerminalExit(terminalId: string, exitCode: number): void {
    if (exitCode === 0) {
      this.notify({
        title: `${terminalId} fertig`,
        body: `${terminalId} wurde erfolgreich beendet.`,
        level: 'success',
        terminalId,
      });
      return;
    }

    this.notify({
      title: `${terminalId} fehlgeschlagen`,
      body: `${terminalId} wurde mit Exit ${exitCode} beendet.`,
      level: 'error',
      terminalId,
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

    const desktopNotification = new Notification({
      title: notification.title,
      body: notification.body,
    });

    desktopNotification.on('click', () => {
      this.focusMainWindow();
    });

    desktopNotification.show();
  }
}
