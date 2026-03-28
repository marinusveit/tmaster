import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { NotificationManager } from '@main/notifications/NotificationManager';

const createdDesktopNotifications: Array<{
  title: string;
  body: string;
  show: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  actions?: Array<{ type: string; text: string }>;
}> = [];

vi.mock('electron', () => {
  class MockNotification {
    public static isSupported = vi.fn(() => true);
    public readonly show = vi.fn();
    public readonly on = vi.fn();

    public constructor(options: { title: string; body: string; actions?: Array<{ type: string; text: string }> }) {
      createdDesktopNotifications.push({
        title: options.title,
        body: options.body,
        show: this.show,
        on: this.on,
        actions: options.actions,
      });
    }
  }

  return {
    Notification: MockNotification,
  };
});

const createTestDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

describe('NotificationManager', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
    createdDesktopNotifications.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it('notify erstellt Notification mit ID und Timestamp', () => {
    const manager = new NotificationManager(db, vi.fn(), () => true, vi.fn(), undefined, undefined, vi.fn());

    const notification = manager.notify({
      title: 'A',
      body: 'B',
      level: 'info',
      terminalId: 't1',
    });

    expect(notification.id).toBeTruthy();
    expect(notification.timestamp).toBe(1700000000000);
  });

  it('notify speichert in DB und broadcastet', () => {
    const broadcast = vi.fn();
    const manager = new NotificationManager(db, broadcast, () => true, vi.fn(), undefined, undefined, vi.fn());

    manager.notify({ title: 'Save', body: 'Stored', level: 'success', terminalId: 't1' });

    const unread = manager.getUnread();
    expect(unread).toHaveLength(1);
    expect(unread[0]?.title).toBe('Save');
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it('onTerminalEvent erzeugt Notification bei error', () => {
    const manager = new NotificationManager(db, vi.fn(), () => true, vi.fn(), undefined, undefined, vi.fn());

    manager.onTerminalEvent({
      terminalId: 't1',
      timestamp: Date.now(),
      type: 'error',
      summary: 'fatal',
      source: 'pattern',
    });

    const unread = manager.getUnread();
    expect(unread).toHaveLength(1);
    expect(unread[0]?.level).toBe('error');
  });

  it('onTerminalEvent ignoriert normale warnings', () => {
    const manager = new NotificationManager(db, vi.fn(), () => true, vi.fn(), undefined, undefined, vi.fn());

    manager.onTerminalEvent({
      terminalId: 't1',
      timestamp: Date.now(),
      type: 'warning',
      summary: 'just warning',
      source: 'pattern',
    });

    expect(manager.getUnread()).toHaveLength(0);
  });

  it('onTerminalExit erzeugt success bei exitCode 0', () => {
    const manager = new NotificationManager(db, vi.fn(), () => true, vi.fn(), undefined, undefined, vi.fn());

    manager.onTerminalExit('t1', 0);
    const unread = manager.getUnread();

    expect(unread).toHaveLength(1);
    expect(unread[0]?.level).toBe('success');
  });

  it('onTerminalExit erzeugt error bei exitCode 1', () => {
    const manager = new NotificationManager(db, vi.fn(), () => true, vi.fn(), undefined, undefined, vi.fn());

    manager.onTerminalExit('t1', 1);
    const unread = manager.getUnread();

    expect(unread).toHaveLength(1);
    expect(unread[0]?.level).toBe('error');
  });

  it('dismiss markiert Notification als gelesen', () => {
    const manager = new NotificationManager(db, vi.fn(), () => true, vi.fn(), undefined, undefined, vi.fn());
    const notification = manager.notify({ title: 'Read', body: 'Me', level: 'info' });

    manager.dismiss(notification.id);

    expect(manager.getUnread()).toHaveLength(0);
  });

  it('rate-limited Desktop Notifications pro Terminal', () => {
    const manager = new NotificationManager(db, vi.fn(), () => false, vi.fn(), undefined, undefined, vi.fn());

    manager.notify({ title: 'A', body: 'One', level: 'error', terminalId: 't1' });
    manager.notify({ title: 'B', body: 'Two', level: 'error', terminalId: 't1' });

    expect(createdDesktopNotifications).toHaveLength(1);

    vi.advanceTimersByTime(31_000);
    manager.notify({ title: 'C', body: 'Three', level: 'error', terminalId: 't1' });
    expect(createdDesktopNotifications).toHaveLength(2);
  });

  it('Desktop-Notification nur wenn Fenster nicht fokussiert', () => {
    const managerFocused = new NotificationManager(db, vi.fn(), () => true, vi.fn(), undefined, undefined, vi.fn());
    managerFocused.notify({ title: 'No', body: 'Desktop', level: 'info', terminalId: 't1' });
    expect(createdDesktopNotifications).toHaveLength(0);

    const managerUnfocused = new NotificationManager(db, vi.fn(), () => false, vi.fn(), undefined, undefined, vi.fn());
    managerUnfocused.notify({ title: 'Yes', body: 'Desktop', level: 'info', terminalId: 't2' });
    expect(createdDesktopNotifications).toHaveLength(1);
  });

  it('waiting erzeugt sofortige Notification mit Kontext, Hinweis und Antworten-Aktion', () => {
    const broadcast = vi.fn();
    const manager = new NotificationManager(
      db,
      broadcast,
      () => true,
      vi.fn(),
      () => ({
        displayName: 'T3',
        workspaceId: 'ws1',
      }),
      () => 'Mit "y" nur bestätigen, wenn der Schritt erwartet ist.',
      vi.fn(),
    );

    manager.onTerminalEvent({
      terminalId: 't3',
      timestamp: Date.now(),
      type: 'waiting',
      summary: 'Run setup now? [Y/n]',
      source: 'pattern',
    });

    const unread = manager.getUnread();
    expect(unread).toHaveLength(1);
    expect(unread[0]).toEqual(expect.objectContaining({
      title: 'T3 wartet auf Input',
      level: 'warning',
      workspaceId: 'ws1',
      action: {
        label: 'Antworten',
        type: 'reply-terminal',
        payload: 't3',
      },
    }));
    expect(unread[0]?.body).toContain('Run setup now? [Y/n]');
    expect(unread[0]?.body).toContain('Vorschlag: Mit "y" nur bestätigen');
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it('waiting dedupliziert identische Rueckfragen innerhalb des Cooldowns', () => {
    const manager = new NotificationManager(db, vi.fn(), () => true, vi.fn(), undefined, undefined, vi.fn());

    const waitingEvent = {
      terminalId: 't1',
      timestamp: Date.now(),
      type: 'waiting' as const,
      summary: 'Continue deploy? [Y/n]',
      source: 'pattern' as const,
    };

    manager.onTerminalEvent(waitingEvent);
    manager.onTerminalEvent({
      ...waitingEvent,
      timestamp: Date.now() + 10_000,
    });

    expect(manager.getUnread()).toHaveLength(1);

    manager.onTerminalEvent({
      ...waitingEvent,
      timestamp: Date.now() + 31_000,
    });

    expect(manager.getUnread()).toHaveLength(2);
  });

  it('waiting-notification leitet Desktop-Action in den Reply-Flow weiter', () => {
    const focusMainWindow = vi.fn();
    const onReplyRequested = vi.fn();
    const manager = new NotificationManager(
      db,
      vi.fn(),
      () => false,
      focusMainWindow,
      () => ({
        displayName: 'T1',
        workspaceId: 'ws1',
      }),
      undefined,
      onReplyRequested,
    );

    manager.onTerminalEvent({
      terminalId: 't1',
      timestamp: Date.now(),
      type: 'waiting',
      summary: 'Waiting for input',
      details: 'Continue deployment?\n⏳ waiting for input',
      source: 'pattern',
    });

    expect(createdDesktopNotifications).toHaveLength(1);
    expect(createdDesktopNotifications[0]?.actions?.[0]?.text).toBe('Antworten');
    expect(createdDesktopNotifications[0]?.body).toContain('Continue deployment?');

    const actionHandler = createdDesktopNotifications[0]?.on.mock.calls.find((call) => call[0] === 'action')?.[1] as
      | ((details: { actionIndex: number }) => void)
      | undefined;

    actionHandler?.({ actionIndex: 0 });

    expect(focusMainWindow).toHaveBeenCalledTimes(1);
    expect(onReplyRequested).toHaveBeenCalledWith({
      notificationId: expect.any(String),
      terminalId: 't1',
    });
  });
});
