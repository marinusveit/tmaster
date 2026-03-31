import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrations';
import { registerKeybindingHandlers } from '@main/ipc/registerKeybindingHandlers';

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

describe('registerKeybindingHandlers', () => {
  let db: InstanceType<typeof Database>;

  afterEach(() => {
    db?.close();
  });

  it('liefert die Default-Keybindings wenn keine Overrides gespeichert sind', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerKeybindingHandlers(ipcMain as never, db);

    const result = ipcMain.invoke('keybindings:get') as {
      keybindings: Record<string, string>;
      customKeybindings: Record<string, string>;
    };

    expect(result.keybindings).toMatchObject({
      quickSwitcher: 'Mod+K',
      createTerminal: 'Mod+Shift+T',
      toggleAssistant: 'Mod+.',
    });
    expect(result.customKeybindings).toEqual({});
  });

  it('persistiert ein Custom-Keybinding und liefert den Merge mit Defaults', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerKeybindingHandlers(ipcMain as never, db);

    const result = ipcMain.invoke('keybindings:set', {
      action: 'createTerminal',
      shortcut: 'ctrl+alt+n',
    }) as {
      keybindings: Record<string, string>;
      customKeybindings: Record<string, string>;
    };

    expect(result.keybindings.createTerminal).toBe('Mod+Alt+N');
    expect(result.customKeybindings.createTerminal).toBe('Mod+Alt+N');

    const storedRows = db.prepare('SELECT action, shortcut FROM keybindings').all() as Array<{
      action: string;
      shortcut: string;
    }>;
    expect(storedRows).toContainEqual({ action: 'createTerminal', shortcut: 'Mod+Alt+N' });
  });

  it('setzt ein Custom-Keybinding wieder auf den Default zurück', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerKeybindingHandlers(ipcMain as never, db);

    ipcMain.invoke('keybindings:set', {
      action: 'toggleAssistant',
      shortcut: 'ctrl+alt+a',
    });

    const result = ipcMain.invoke('keybindings:reset', {
      action: 'toggleAssistant',
    }) as {
      keybindings: Record<string, string>;
      customKeybindings: Record<string, string>;
    };

    expect(result.keybindings.toggleAssistant).toBe('Mod+.');
    expect(result.customKeybindings.toggleAssistant).toBeUndefined();

    const rowCount = db.prepare('SELECT COUNT(*) AS count FROM keybindings').get() as { count: number };
    expect(rowCount.count).toBe(0);
  });

  it('lehnt Konflikte gegen bestehende effektive Shortcuts ab', () => {
    db = createTestDb();
    const ipcMain = createMockIpcMain();
    registerKeybindingHandlers(ipcMain as never, db);

    expect(() =>
      ipcMain.invoke('keybindings:set', {
        action: 'toggleAssistant',
        shortcut: 'ctrl+shift+t',
      }),
    ).toThrow('Shortcut already assigned to createTerminal');
  });
});
