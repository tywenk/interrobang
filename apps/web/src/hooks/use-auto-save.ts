import { useEffect } from 'react';

import { useAppServices } from '../app-context';
import { useProjectStore } from '../stores/project-store';

export function useAutoSave(projectId: string): void {
  const { saveLoop } = useAppServices();
  useEffect(() => {
    const unsub = useProjectStore.subscribe((s, prev) => {
      const cur = s.openProjects[projectId];
      const old = prev.openProjects[projectId];
      if (!cur || !cur.dirty || cur === old) return;
      const pending = s.pendingMutations[projectId] ?? [];
      saveLoop.scheduleMutations(projectId, pending);
    });
    return () => {
      unsub();
      void saveLoop.flush();
    };
  }, [projectId, saveLoop]);
}
