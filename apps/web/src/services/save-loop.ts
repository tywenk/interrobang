import { unionAffects } from '@interrobang/core';
import type { MutationTarget } from '@interrobang/core';
import type { BrowserStorageAdapter } from '@interrobang/storage';
import { useProjectStore } from '../stores/project-store';

const DEBOUNCE_MS = 800;

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  targets: readonly MutationTarget[];
}

export class SaveLoop {
  private pending = new Map<string, Pending>();
  constructor(private storagePromise: Promise<BrowserStorageAdapter>) {}

  /**
   * Queue a save for `projectId`. If `targets` is empty, the flush falls back
   * to `saveFont` (full-font rewrite) — used by the legacy path and by undo/
   * redo where reverse-affects aren't tracked.
   */
  scheduleMutations(projectId: string, targets: readonly MutationTarget[]): void {
    const existing = this.pending.get(projectId);
    if (existing) clearTimeout(existing.timer);
    const nextTargets = existing ? unionAffects(existing.targets, targets) : targets;
    const timer = setTimeout(() => void this.flushProject(projectId), DEBOUNCE_MS);
    this.pending.set(projectId, { timer, targets: nextTargets });
  }

  /** Legacy full-font save path; used when INCREMENTAL_SAVE flag is off. */
  scheduleFull(projectId: string): void {
    this.scheduleMutations(projectId, []);
  }

  cancel(projectId: string): void {
    const p = this.pending.get(projectId);
    if (p) {
      clearTimeout(p.timer);
      this.pending.delete(projectId);
    }
  }

  async flush(): Promise<void> {
    const ids = [...this.pending.keys()];
    for (const id of ids) await this.flushProject(id);
  }

  private async flushProject(projectId: string): Promise<void> {
    const pending = this.pending.get(projectId);
    this.pending.delete(projectId);
    if (!pending) return;
    clearTimeout(pending.timer);
    const proj = useProjectStore.getState().openProjects[projectId];
    if (!proj) return;
    try {
      const storage = await this.storagePromise;
      if (pending.targets.length === 0) {
        await storage.saveFont(projectId, proj.font);
      } else {
        for (const target of pending.targets) {
          await storage.applyMutation(projectId, target, proj.font);
        }
      }
      useProjectStore.getState().markClean(projectId);
    } catch (err) {
      console.error('Save failed', err);
    }
  }
}
