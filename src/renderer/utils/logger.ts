const toErrorDetails = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
};

export const logRendererWarning = (message: string, error?: unknown): void => {
  if (!import.meta.env.DEV) {
    return;
  }

  if (error === undefined) {
    console.warn(`[tmaster] ${message}`);
    return;
  }

  console.warn(`[tmaster] ${message}\n${toErrorDetails(error)}`);
};
