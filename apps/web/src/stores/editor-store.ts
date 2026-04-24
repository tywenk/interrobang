import type { Selection } from '@interrobang/editor';
import { EMPTY_SELECTION } from '@interrobang/editor';
import { create } from 'zustand';

export type Tool = 'select' | 'pen' | 'add-point';

interface EditorState {
  tool: Tool;
  selectionByGlyph: { [glyphId: string]: Selection };
  activeGlyphByProject: { [projectId: string]: string };
  addGlyphPromptProjectId: string | null;

  setTool: (t: Tool) => void;
  setSelection: (glyphId: string, sel: Selection) => void;
  clearSelection: (glyphId: string) => void;
  setActiveGlyph: (projectId: string, glyphId: string) => void;
  requestAddGlyph: (projectId: string) => void;
  closeAddGlyphPrompt: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selectionByGlyph: {},
  activeGlyphByProject: {},
  addGlyphPromptProjectId: null,

  setTool(tool) {
    set({ tool });
  },
  setSelection(glyphId, sel) {
    set((s) => ({ selectionByGlyph: { ...s.selectionByGlyph, [glyphId]: sel } }));
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
  requestAddGlyph(projectId) {
    set({ addGlyphPromptProjectId: projectId });
  },
  closeAddGlyphPrompt() {
    set({ addGlyphPromptProjectId: null });
  },
}));

export { EMPTY_SELECTION };
