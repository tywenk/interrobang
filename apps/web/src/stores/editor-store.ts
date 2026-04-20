import { create } from 'zustand';

export type Tool = 'select' | 'pen';

interface EditorState {
  tool: Tool;
  selectionByGlyph: { [glyphId: string]: ReadonlySet<string> };
  activeGlyphByProject: { [projectId: string]: string };

  setTool: (t: Tool) => void;
  setSelection: (glyphId: string, ids: ReadonlySet<string>) => void;
  clearSelection: (glyphId: string) => void;
  setActiveGlyph: (projectId: string, glyphId: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selectionByGlyph: {},
  activeGlyphByProject: {},

  setTool(tool) {
    set({ tool });
  },
  setSelection(glyphId, ids) {
    set((s) => ({ selectionByGlyph: { ...s.selectionByGlyph, [glyphId]: ids } }));
  },
  clearSelection(glyphId) {
    set((s) => {
      const rest = { ...s.selectionByGlyph };
      delete rest[glyphId];
      return { selectionByGlyph: rest };
    });
  },
  setActiveGlyph(projectId, glyphId) {
    set((s) => ({
      activeGlyphByProject: { ...s.activeGlyphByProject, [projectId]: glyphId },
    }));
  },
}));
