/// <reference types="vite/client" />

import type { TmasterApi } from '@shared/types/preload';

declare global {
  interface Window {
    tmaster: TmasterApi;
  }
}

export {};
