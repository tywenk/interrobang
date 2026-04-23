import type { FontIoClient } from '@interrobang/font-io';
import type { BrowserStorageAdapter } from '@interrobang/storage';
import { createContext, useContext } from 'react';

import type { SaveLoop } from './services/save-loop';

export interface AppServices {
  storage: Promise<BrowserStorageAdapter>;
  fontIo: FontIoClient;
  saveLoop: SaveLoop;
}

export const AppContext = createContext<AppServices | null>(null);

export function useAppServices(): AppServices {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppServices used outside <AppProvider>');
  return ctx;
}
