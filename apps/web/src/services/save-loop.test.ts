import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UndoRedoStack, type Font, type MutationTarget } from '@interrobang/core';
import type { BrowserStorageAdapter } from '@interrobang/storage';
import { SaveLoop } from './save-loop';
import { useProjectStore } from '../stores/project-store';

interface Call {
  kind: 'applyMutation' | 'saveFont';
  projectId: string;
  target?: MutationTarget;
}

function makeFakeStorage(): { storage: BrowserStorageAdapter; calls: Call[] } {
  const calls: Call[] = [];
  const storage = {
    applyMutation: async (projectId: string, target: MutationTarget) => {
      calls.push({ kind: 'applyMutation', projectId, target });
    },
    saveFont: async (projectId: string) => {
      calls.push({ kind: 'saveFont', projectId });
    },
  } as unknown as BrowserStorageAdapter;
  return { storage, calls };
}

function emptyFont(id: string): Font {
  return {
    id,
    meta: {
      familyName: 'Test',
      styleName: 'Regular',
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      capHeight: 700,
      xHeight: 500,
    },
    masters: [],
    glyphs: {},
    glyphOrder: [],
    kerning: [],
    revision: 0,
  };
}

function seedProject(projectId: string): void {
  useProjectStore.setState({
    openProjects: {
      [projectId]: {
        id: projectId,
        name: 'Test',
        font: emptyFont(projectId),
        undoStack: new UndoRedoStack<Font>(),
        dirty: true,
      },
    },
    openOrder: [projectId],
    activeId: projectId,
    pendingMutations: {},
  });
}

function resetStore(): void {
  useProjectStore.setState({
    openProjects: {},
    openOrder: [],
    activeId: null,
    pendingMutations: {},
  });
}

describe('SaveLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetStore();
  });

  it('dedupes duplicate mutation targets on flush', async () => {
    const { storage, calls } = makeFakeStorage();
    const loop = new SaveLoop(Promise.resolve(storage));
    seedProject('p1');
    const target: MutationTarget = { kind: 'layer', glyphId: 'g', layerId: 'l' };
    loop.scheduleMutations('p1', [target]);
    loop.scheduleMutations('p1', [target]);
    await loop.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('applyMutation');
    expect(calls[0]?.target).toEqual(target);
  });

  it('empty targets fall back to saveFont', async () => {
    const { storage, calls } = makeFakeStorage();
    const loop = new SaveLoop(Promise.resolve(storage));
    seedProject('p1');
    loop.scheduleMutations('p1', []);
    await loop.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('saveFont');
    expect(calls[0]?.projectId).toBe('p1');
  });

  it('applies distinct targets in order', async () => {
    const { storage, calls } = makeFakeStorage();
    const loop = new SaveLoop(Promise.resolve(storage));
    seedProject('p1');
    const a: MutationTarget = { kind: 'layer', glyphId: 'g1', layerId: 'l1' };
    const b: MutationTarget = { kind: 'layer', glyphId: 'g2', layerId: 'l2' };
    loop.scheduleMutations('p1', [a]);
    loop.scheduleMutations('p1', [b]);
    await loop.flush();
    expect(calls.map((c) => c.kind)).toEqual(['applyMutation', 'applyMutation']);
    expect(calls[0]?.target).toEqual(a);
    expect(calls[1]?.target).toEqual(b);
  });

  it('cancel drops a pending save', async () => {
    const { storage, calls } = makeFakeStorage();
    const loop = new SaveLoop(Promise.resolve(storage));
    seedProject('p1');
    loop.scheduleMutations('p1', [{ kind: 'layer', glyphId: 'g', layerId: 'l' }]);
    loop.cancel('p1');
    await loop.flush();
    expect(calls).toHaveLength(0);
  });

  it('scheduleFull routes through the saveFont path', async () => {
    const { storage, calls } = makeFakeStorage();
    const loop = new SaveLoop(Promise.resolve(storage));
    seedProject('p1');
    loop.scheduleFull('p1');
    await loop.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('saveFont');
  });
});
