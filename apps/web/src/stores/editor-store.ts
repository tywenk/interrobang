import { create } from 'zustand';

export type Tool = 'select' | 'pen';

interface EditorState {
  tool: Tool;
  selectionByGlyph: { [glyphId: string]: ReadonlySet<string> };

  setTool: (t: Tool) => void;
  setSelection: (glyphId: string, ids: ReadonlySet<string>) => void;
  clearSelection: (glyphId: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selectionByGlyph: {},

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
}));
