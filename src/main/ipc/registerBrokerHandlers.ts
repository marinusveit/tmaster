import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { ContextQuery } from '../../shared/types/broker';
import type { EventType } from '../../shared/types/event';
import type { ContextBroker } from '../broker/ContextBroker';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isEventType = (value: unknown): value is EventType => {
  return value === 'error'
    || value === 'warning'
    || value === 'test_result'
    || value === 'server_started'
    || value === 'context_warning'
    || value === 'waiting';
};

const parseContextQuery = (payload: unknown): ContextQuery => {
  if (!isObject(payload)) {
    return {};
  }

  const query: ContextQuery = {};

  if (typeof payload.workspaceId === 'string') {
    query.workspaceId = payload.workspaceId;
  }

  if (typeof payload.terminalId === 'string') {
    query.terminalId = payload.terminalId;
  }

  if (payload.eventTypes !== undefined) {
    if (!Array.isArray(payload.eventTypes) || !payload.eventTypes.every(isEventType)) {
      throw new Error('Invalid context query: eventTypes');
    }
    query.eventTypes = payload.eventTypes;
  }

  if (payload.since !== undefined) {
    if (typeof payload.since !== 'number' || !Number.isFinite(payload.since)) {
      throw new Error('Invalid context query: since');
    }
    query.since = payload.since;
  }

  if (payload.limit !== undefined) {
    if (typeof payload.limit !== 'number' || !Number.isFinite(payload.limit) || payload.limit < 1) {
      throw new Error('Invalid context query: limit');
    }
    query.limit = Math.floor(payload.limit);
  }

  return query;
};

export const registerBrokerHandlers = (
  ipcMain: IpcMain,
  contextBroker: ContextBroker,
): void => {
  ipcMain.handle(IPC_CHANNELS.brokerGetContext, (_event, payload: unknown) => {
    const query = parseContextQuery(payload);
    return contextBroker.getContext(query);
  });

  ipcMain.handle(IPC_CHANNELS.brokerGetConflicts, (_event, payload: unknown) => {
    const query = parseContextQuery(payload);
    return contextBroker.getContext(query).conflicts;
  });
};
