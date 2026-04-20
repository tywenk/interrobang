import { useProjectStore } from '../stores/project-store';
import type { BrowserStorageAdapter } from '@interrobang/storage';

const DEBOUNCE_MS = 800;

export class SaveLoop {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private storagePromise: Promise<BrowserStorageAdapter>) {}

  schedule(projectId: string): void {
    this.cancel(projectId);
    const timer = setTimeout(() => this.flushProject(projectId), DEBOUNCE_MS);
    this.timers.set(projectId, timer);
  }

  cancel(projectId: string): void {
    const t = this.timers.get(projectId);
    if (t) {
      clearTimeout(t);
      this.timers.delete(projectId);
    }
  }

  async flush(): Promise<void> {
    const ids = [...this.timers.keys()];
    for (const id of ids) await this.flushProject(id);
  }

  private async flushProject(projectId: string): Promise<void> {
    this.timers.delete(projectId);
    const proj = useProjectStore.getState().openProjects[projectId];
    if (!proj) return;
    try {
      const storage = await this.storagePromise;
      await storage.saveFont(projectId, proj.font);
      useProjectStore.getState().markClean(projectId);
    } catch (err) {
      console.error('Save failed', err);
    }
  }
}
