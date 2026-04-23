import { useMemo, type ReactNode } from 'react';
import { AppContext, type AppServices } from './app-context';
import { createStorage } from './services/create-storage';
import { createFontIo } from './services/create-font-io';
import { SaveLoop } from './services/save-loop';

export function AppProvider({ children }: { children: ReactNode }) {
  const services = useMemo<AppServices>(() => {
    const storage = createStorage();
    return {
      storage,
      fontIo: createFontIo(),
      saveLoop: new SaveLoop(storage),
    };
  }, []);
  return <AppContext value={services}>{children}</AppContext>;
}
