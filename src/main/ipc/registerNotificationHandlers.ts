import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { NotificationManager } from '../notifications/NotificationManager';

export const registerNotificationHandlers = (
  ipcMain: IpcMain,
  notificationManager: NotificationManager,
): void => {
  ipcMain.handle(IPC_CHANNELS.notificationDismiss, (_event, payload: unknown) => {
    if (typeof payload !== 'string') {
      throw new Error('Invalid notification id');
    }

    notificationManager.dismiss(payload);
  });
};
