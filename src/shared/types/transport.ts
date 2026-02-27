export interface TransportLayer {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
  send(channel: string, ...args: unknown[]): void;
  on<T>(channel: string, handler: (data: T) => void): () => void;
}
