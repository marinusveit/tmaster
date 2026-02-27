import type { TmasterApi } from '@shared/types/preload';
import type { TransportLayer } from '@shared/types/transport';

declare global {
  interface Window {
    tmaster: TmasterApi;
  }
}

/**
 * Electron-spezifische Implementierung des TransportLayer.
 * Delegiert alle Aufrufe an window.tmaster (contextBridge API).
 */
export class ElectronTransport implements TransportLayer {
  private getApi(): TmasterApi {
    if (!window.tmaster) {
      throw new Error('window.tmaster is not available — preload script not loaded');
    }
    return window.tmaster;
  }

  public async invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const api = this.getApi();
    const method = channel as keyof TmasterApi;

    if (!(method in api)) {
      throw new Error(`Unknown channel: ${channel}`);
    }

    const fn = api[method] as (...fnArgs: unknown[]) => unknown;
    const result = await fn(...args);
    return result as T;
  }

  public send(channel: string, ...args: unknown[]): void {
    // Fire-and-forget: delegiert an invoke, ignoriert das Ergebnis
    void this.invoke(channel, ...args);
  }

  public on<T>(channel: string, handler: (data: T) => void): () => void {
    const api = this.getApi();
    const method = channel as keyof TmasterApi;

    if (!(method in api)) {
      throw new Error(`Unknown event channel: ${channel}`);
    }

    const fn = api[method] as (h: (data: T) => void) => () => void;
    return fn(handler);
  }
}
