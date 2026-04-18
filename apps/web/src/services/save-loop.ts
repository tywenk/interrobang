import { useProjectStore } from '../stores/project-store';
import { getStorage } from './storage';

const DEBOUNCE_MS = 800;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleSave(projectId: string): void {
  const existing = timers.get(projectId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    timers.delete(projectId);
    const proj = useProjectStore.getState().openProjects[projectId];
    if (!proj) return;
    try {
      const s = await getStorage();
      await s.saveFont(projectId, proj.font);
      useProjectStore.getState().markClean(projectId);
    } catch (err) {
      console.error('Save failed', err);
    }
  }, DEBOUNCE_MS);
  timers.set(projectId, timer);
}
