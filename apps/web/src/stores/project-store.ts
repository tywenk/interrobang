import { create } from 'zustand';
import {
  addGlyphCommand,
  createGlyph,
  unionAffects,
  UndoRedoStack,
  type Command,
  type Font,
  type MutationTarget,
} from '@interrobang/core';
import { useEditorStore } from './editor-store';

/**
 * Feature flag: drive auto-save from per-command `affects` targets via
 * `StorageAdapter.applyMutation`. When false, the save loop falls back to
 * the legacy whole-font `saveFont` rewrite. Flip to `false` to roll back
 * incremental save without touching the commit graph.
 */
export const INCREMENTAL_SAVE = true;

export interface OpenProject {
  id: string;
  name: string;
  font: Font;
  undoStack: UndoRedoStack<Font>;
  dirty: boolean;
}

interface ProjectState {
  openProjects: { [id: string]: OpenProject };
  openOrder: string[];
  activeId: string | null;
  /**
   * MutationTargets accumulated since the last successful save, per project.
   * An empty/missing entry means "flush via full saveFont" (the legacy path).
   */
  // TODO(components): pendingMutations will also accumulate component targets
  // once component-edit commands land.
  pendingMutations: { [id: string]: readonly MutationTarget[] };

  addOpenProject: (p: Omit<OpenProject, 'undoStack' | 'dirty'>) => void;
  closeProject: (id: string) => void;
  setActive: (id: string | null) => void;
  applyCommand: (id: string, cmd: Command<Font>) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  markClean: (id: string) => void;
  addGlyph: (projectId: string, char: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  openProjects: {},
  openOrder: [],
  activeId: null,
  pendingMutations: {},

  addOpenProject(p) {
    set((s) => {
      if (s.openProjects[p.id]) return s;
      return {
        openProjects: {
          ...s.openProjects,
          [p.id]: { ...p, undoStack: new UndoRedoStack<Font>(), dirty: false },
        },
        openOrder: [...s.openOrder, p.id],
        activeId: s.activeId ?? p.id,
      };
    });
  },

  closeProject(id) {
    set((s) => {
      const rest = { ...s.openProjects };
      delete rest[id];
      const restPending = { ...s.pendingMutations };
      delete restPending[id];
      const order = s.openOrder.filter((x) => x !== id);
      const activeId = s.activeId === id ? (order[order.length - 1] ?? null) : s.activeId;
      return {
        openProjects: rest,
        openOrder: order,
        activeId,
        pendingMutations: restPending,
      };
    });
  },

  setActive(id) {
    set({ activeId: id });
  },

  applyCommand(id, cmd) {
    const proj = get().openProjects[id];
    if (!proj) return;
    const nextFont = proj.undoStack.apply(proj.font, cmd);
    set((s) => {
      const prevPending = s.pendingMutations[id] ?? [];
      const cmdAffects = cmd.affects ?? [];
      // Flag off → always empty, which routes flush through saveFont.
      const mergedPending = INCREMENTAL_SAVE ? unionAffects(prevPending, cmdAffects) : [];
      return {
        openProjects: { ...s.openProjects, [id]: { ...proj, font: nextFont, dirty: true } },
        pendingMutations: { ...s.pendingMutations, [id]: mergedPending },
      };
    });
  },

  undo(id) {
    const proj = get().openProjects[id];
    if (!proj) return;
    const result = proj.undoStack.undo(proj.font);
    if (!result) return;
    set((s) => {
      const prevPending = s.pendingMutations[id] ?? [];
      return {
        openProjects: { ...s.openProjects, [id]: { ...proj, font: result.state, dirty: true } },
        pendingMutations: {
          ...s.pendingMutations,
          [id]: unionAffects(prevPending, result.command.affects),
        },
      };
    });
  },

  redo(id) {
    const proj = get().openProjects[id];
    if (!proj) return;
    const result = proj.undoStack.redo(proj.font);
    if (!result) return;
    set((s) => {
      const prevPending = s.pendingMutations[id] ?? [];
      return {
        openProjects: { ...s.openProjects, [id]: { ...proj, font: result.state, dirty: true } },
        pendingMutations: {
          ...s.pendingMutations,
          [id]: unionAffects(prevPending, result.command.affects),
        },
      };
    });
  },

  markClean(id) {
    const proj = get().openProjects[id];
    if (!proj) return;
    set((s) => {
      const restPending = { ...s.pendingMutations };
      delete restPending[id];
      return {
        openProjects: { ...s.openProjects, [id]: { ...proj, dirty: false } },
        pendingMutations: restPending,
      };
    });
  },

  // TODO(components): add a parallel addComponent(projectId, name, layer) that
  // uses addComponentCommand + the components table (migration 0002).
  addGlyph(projectId, char) {
    const proj = get().openProjects[projectId];
    if (!proj) return;
    const masterId = proj.font.masters[0]?.id;
    if (!masterId) return;

    const rawChar = (char ?? 'A').trim();
    const safeChar = rawChar.length > 0 ? [...rawChar][0]! : 'A';
    const codepoint = safeChar.codePointAt(0) ?? null;

    const existing = Object.values(proj.font.glyphs);
    const byCodepoint = codepoint
      ? existing.find((g) => g.unicodeCodepoint === codepoint)
      : undefined;
    if (byCodepoint) {
      useEditorStore.getState().setActiveGlyph(projectId, byCodepoint.id);
      return;
    }

    let name = safeChar;
    for (let i = 1; existing.some((g) => g.name === name); i++) name = `${safeChar}.${i}`;

    const glyph = createGlyph({ name, codepoint, masterId, starter: 'triangle' });
    get().applyCommand(projectId, addGlyphCommand({ glyph }));
    useEditorStore.getState().setActiveGlyph(projectId, glyph.id);
  },
}));
