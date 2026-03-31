import type { IpcMain } from 'electron';
import type BetterSqlite3 from 'better-sqlite3';
import {
  buildEffectiveKeybindings,
  findConflictingKeybindingAction,
  normalizeShortcut,
} from '../../common/keybindings';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  KEYBINDING_ACTIONS,
  type CustomKeybindingMap,
  type GetKeybindingsResponse,
  type KeybindingAction,
  type ResetKeybindingRequest,
  type SetKeybindingRequest,
} from '../../shared/types/keybindings';
import { deleteKeybinding, listKeybindings, upsertKeybinding } from '../db/queries';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isKeybindingAction = (value: unknown): value is KeybindingAction => {
  return typeof value === 'string' && KEYBINDING_ACTIONS.includes(value as KeybindingAction);
};

const readStoredKeybindings = (db: BetterSqlite3.Database): CustomKeybindingMap => {
  return listKeybindings(db).reduce<CustomKeybindingMap>((bindings, row) => {
    if (!isKeybindingAction(row.action)) {
      return bindings;
    }

    const normalizedShortcut = normalizeShortcut(row.shortcut);
    if (!normalizedShortcut) {
      return bindings;
    }

    return {
      ...bindings,
      [row.action]: normalizedShortcut,
    };
  }, {});
};

const toResponse = (db: BetterSqlite3.Database): GetKeybindingsResponse => {
  const customKeybindings = readStoredKeybindings(db);
  return {
    keybindings: buildEffectiveKeybindings(customKeybindings),
    customKeybindings,
  };
};

const parseSetKeybindingRequest = (payload: unknown): SetKeybindingRequest => {
  if (!isObject(payload) || !isKeybindingAction(payload.action) || typeof payload.shortcut !== 'string') {
    throw new Error('Invalid keybinding update payload');
  }

  const normalizedShortcut = normalizeShortcut(payload.shortcut);
  if (!normalizedShortcut) {
    throw new Error('Invalid keybinding shortcut');
  }

  return {
    action: payload.action,
    shortcut: normalizedShortcut,
  };
};

const parseResetKeybindingRequest = (payload: unknown): ResetKeybindingRequest => {
  if (!isObject(payload) || !isKeybindingAction(payload.action)) {
    throw new Error('Invalid keybinding reset payload');
  }

  return { action: payload.action };
};

const assertNoConflict = (
  db: BetterSqlite3.Database,
  request: SetKeybindingRequest,
): void => {
  const customKeybindings = readStoredKeybindings(db);
  const effectiveKeybindings = buildEffectiveKeybindings({
    ...customKeybindings,
    [request.action]: request.shortcut,
  });
  const conflictingAction = findConflictingKeybindingAction(
    request.action,
    request.shortcut,
    effectiveKeybindings,
  );

  if (conflictingAction) {
    throw new Error(`Shortcut already assigned to ${conflictingAction}`);
  }
};

export const registerKeybindingHandlers = (
  ipcMain: IpcMain,
  db: BetterSqlite3.Database,
): void => {
  ipcMain.handle(IPC_CHANNELS.keybindingsGet, () => {
    return toResponse(db);
  });

  ipcMain.handle(IPC_CHANNELS.keybindingsSet, (_event, payload: unknown) => {
    const request = parseSetKeybindingRequest(payload);
    assertNoConflict(db, request);
    upsertKeybinding(db, request.action, request.shortcut, Date.now());
    return toResponse(db);
  });

  ipcMain.handle(IPC_CHANNELS.keybindingsReset, (_event, payload: unknown) => {
    const request = parseResetKeybindingRequest(payload);
    deleteKeybinding(db, request.action);
    return toResponse(db);
  });
};
