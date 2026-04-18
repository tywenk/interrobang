import { create } from 'zustand';
import { UndoRedoStack, type Command, type Font } from '@interrobang/core';

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

  addOpenProject: (p: Omit<OpenProject, 'undoStack' | 'dirty'>) => void;
  closeProject: (id: string) => void;
  setActive: (id: string | null) => void;
  applyCommand: (id: string, cmd: Command<Font>) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  markClean: (id: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  openProjects: {},
  openOrder: [],
  activeId: null,

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
      const order = s.openOrder.filter((x) => x !== id);
      const activeId = s.activeId === id ? (order[order.length - 1] ?? null) : s.activeId;
      return { openProjects: rest, openOrder: order, activeId };
    });
  },

  setActive(id) {
    set({ activeId: id });
  },

  applyCommand(id, cmd) {
    const proj = get().openProjects[id];
    if (!proj) return;
    const nextFont = proj.undoStack.apply(proj.font, cmd);
    set((s) => ({
      openProjects: { ...s.openProjects, [id]: { ...proj, font: nextFont, dirty: true } },
    }));
  },

  undo(id) {
    const proj = get().openProjects[id];
    if (!proj) return;
    const next = proj.undoStack.undo(proj.font);
    if (!next) return;
    set((s) => ({
      openProjects: { ...s.openProjects, [id]: { ...proj, font: next, dirty: true } },
    }));
  },

  redo(id) {
    const proj = get().openProjects[id];
    if (!proj) return;
    const next = proj.undoStack.redo(proj.font);
    if (!next) return;
    set((s) => ({
      openProjects: { ...s.openProjects, [id]: { ...proj, font: next, dirty: true } },
    }));
  },

  markClean(id) {
    const proj = get().openProjects[id];
    if (!proj) return;
    set((s) => ({
      openProjects: { ...s.openProjects, [id]: { ...proj, dirty: false } },
    }));
  },
}));
