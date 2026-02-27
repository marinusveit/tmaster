import { ElectronTransport } from './ElectronTransport';
import type { TransportLayer } from '@shared/types/transport';

// Singleton — eine Transport-Instanz für die gesamte Renderer-App
export const transport: TransportLayer = new ElectronTransport();

export type { TransportLayer } from '@shared/types/transport';
export { ElectronTransport } from './ElectronTransport';
