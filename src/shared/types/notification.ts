export type NotificationLevel = 'info' | 'warning' | 'error' | 'success';

export interface NotificationAction {
  label: string;
  type: 'focus-terminal' | 'close-terminal' | 'dismiss';
  payload?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  level: NotificationLevel;
  terminalId?: string;
  workspaceId?: string;
  timestamp: number;
  isRead: boolean;
  action?: NotificationAction;
}
