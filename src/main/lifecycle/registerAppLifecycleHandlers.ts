type AppLifecycleEvent = 'activate' | 'before-quit' | 'window-all-closed';

interface AppLifecycleAdapter {
  on: (event: AppLifecycleEvent, listener: () => void) => void;
  quit: () => void;
}

interface RegisterAppLifecycleHandlersOptions {
  app: AppLifecycleAdapter;
  isDarwin: boolean;
  getWindowCount: () => number;
  createMainWindow: () => Promise<unknown>;
  destroyAllTerminals: () => void;
  closeDatabase: () => void;
}

export const registerAppLifecycleHandlers = (
  options: RegisterAppLifecycleHandlersOptions,
): void => {
  const {
    app,
    isDarwin,
    getWindowCount,
    createMainWindow,
    destroyAllTerminals,
    closeDatabase,
  } = options;

  app.on('activate', () => {
    if (getWindowCount() === 0) {
      void createMainWindow();
    }
  });

  app.on('before-quit', () => {
    destroyAllTerminals();
    closeDatabase();
  });

  app.on('window-all-closed', () => {
    // Auf macOS läuft die App ohne Fenster weiter, PTYs dürfen dabei nicht weiterlaufen.
    destroyAllTerminals();

    if (!isDarwin) {
      app.quit();
    }
  });
};
