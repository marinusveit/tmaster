import { describe, expect, it, vi } from 'vitest';
import { registerAppLifecycleHandlers } from '@main/lifecycle/registerAppLifecycleHandlers';

type LifecycleEvent = 'activate' | 'before-quit' | 'window-all-closed';

interface AppMock {
  on: (event: LifecycleEvent, listener: () => void) => void;
  quit: () => void;
}

const createMockApp = () => {
  const handlers = new Map<LifecycleEvent, () => void>();
  const app: AppMock = {
    on: vi.fn((event: LifecycleEvent, listener: () => void) => {
      handlers.set(event, listener);
    }),
    quit: vi.fn(),
  };

  const emit = (event: LifecycleEvent): void => {
    const handler = handlers.get(event);
    if (!handler) {
      throw new Error(`Missing lifecycle handler for ${event}`);
    }

    handler();
  };

  return { app, emit };
};

describe('registerAppLifecycleHandlers', () => {
  it('räumt bei before-quit Terminals und DB auf', () => {
    const { app, emit } = createMockApp();
    const destroyAllTerminals = vi.fn();
    const closeDatabase = vi.fn();

    registerAppLifecycleHandlers({
      app,
      isDarwin: true,
      getWindowCount: () => 0,
      createMainWindow: vi.fn(async () => undefined),
      destroyAllTerminals,
      closeDatabase,
    });

    emit('before-quit');

    expect(destroyAllTerminals).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it('beendet bei window-all-closed immer alle PTYs', () => {
    const { app, emit } = createMockApp();
    const destroyAllTerminals = vi.fn();

    registerAppLifecycleHandlers({
      app,
      isDarwin: true,
      getWindowCount: () => 0,
      createMainWindow: vi.fn(async () => undefined),
      destroyAllTerminals,
      closeDatabase: vi.fn(),
    });

    emit('window-all-closed');

    expect(destroyAllTerminals).toHaveBeenCalledTimes(1);
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('beendet auf non-macOS die App wenn alle Fenster geschlossen sind', () => {
    const { app, emit } = createMockApp();

    registerAppLifecycleHandlers({
      app,
      isDarwin: false,
      getWindowCount: () => 0,
      createMainWindow: vi.fn(async () => undefined),
      destroyAllTerminals: vi.fn(),
      closeDatabase: vi.fn(),
    });

    emit('window-all-closed');

    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it('erstellt bei activate ein Fenster wenn keines offen ist', () => {
    const { app, emit } = createMockApp();
    const createMainWindow = vi.fn(async () => undefined);

    registerAppLifecycleHandlers({
      app,
      isDarwin: true,
      getWindowCount: () => 0,
      createMainWindow,
      destroyAllTerminals: vi.fn(),
      closeDatabase: vi.fn(),
    });

    emit('activate');

    expect(createMainWindow).toHaveBeenCalledTimes(1);
  });

  it('erstellt bei activate kein neues Fenster wenn bereits eines offen ist', () => {
    const { app, emit } = createMockApp();
    const createMainWindow = vi.fn(async () => undefined);

    registerAppLifecycleHandlers({
      app,
      isDarwin: true,
      getWindowCount: () => 1,
      createMainWindow,
      destroyAllTerminals: vi.fn(),
      closeDatabase: vi.fn(),
    });

    emit('activate');

    expect(createMainWindow).not.toHaveBeenCalled();
  });
});
