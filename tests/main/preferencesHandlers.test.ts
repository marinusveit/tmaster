import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { registerPreferenceHandlers } from '@main/ipc/registerPreferenceHandlers';

type HandlerFn = (event: unknown, payload: unknown) => unknown;

const createTestDb = () => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

const createMockIpcMain = () => {
  const handlers = new Map<string, HandlerFn>();
  return {
    handle: vi.fn((channel: string, handler: HandlerFn) => {
      handlers.set(channel, handler);
    }),
    invoke: (channel: string, payload?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler for ${channel}`);
      }

      return handler({}, payload);
    },
  };
};

describe('registerPreferenceHandlers', () => {
  let db: InstanceType<typeof Database>;

  afterEach(() => {
    db?.close();
  });

  it('liefert Default-Preferences wenn noch nichts gespeichert ist', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerPreferenceHandlers(ipcMain as never, db);

    const result = ipcMain.invoke('preferences:get') as {
      preferences: {
        theme: string;
        terminalFontSize: number;
        terminalFontFamily: string;
        uiScale: number;
      };
    };

    expect(result.preferences).toEqual({
      theme: 'dark',
      terminalFontSize: 14,
      terminalFontFamily: 'JetBrains Mono',
      uiScale: 100,
    });
  });

  it('persistiert und liefert aktualisierte Preferences', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerPreferenceHandlers(ipcMain as never, db);

    const result = ipcMain.invoke('preferences:set', {
      key: 'theme',
      value: 'light',
    }) as {
      preferences: {
        theme: string;
      };
    };

    expect(result.preferences.theme).toBe('light');

    const storedRows = db.prepare('SELECT key, value FROM preferences').all() as Array<{
      key: string;
      value: string;
    }>;
    expect(storedRows).toContainEqual({ key: 'theme', value: 'light' });
  });

  it('validiert ungueltige Preference-Updates', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerPreferenceHandlers(ipcMain as never, db);

    expect(() =>
      ipcMain.invoke('preferences:set', {
        key: 'terminalFontSize',
        value: 99,
      }),
    ).toThrow('Invalid terminal font size');
  });
});
