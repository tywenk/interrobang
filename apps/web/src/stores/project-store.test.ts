import {
  addGlyphCommand,
  createGlyph,
  emptyFont,
  movePointsCommand,
  UndoRedoStack,
  type Font,
} from '@interrobang/core';
import { beforeEach, describe, expect, test } from 'vitest';

import { useProjectStore, type OpenProject } from './project-store';

function seedProject(font: Font): OpenProject {
  return {
    id: font.id,
    name: 'test',
    font,
    undoStack: new UndoRedoStack<Font>(),
    dirty: false,
  };
}

function resetStore(initial: OpenProject): void {
  useProjectStore.setState({
    openProjects: { [initial.id]: initial },
    openOrder: [initial.id],
    activeId: initial.id,
    pendingMutations: {},
  });
}

describe('project-store: incremental save routing', () => {
  let projectId: string;
  let masterId: string;

  beforeEach(() => {
    const font = emptyFont('Test');
    const proj = seedProject(font);
    projectId = proj.id;
    masterId = font.masters[0]!.id;
    resetStore(proj);
  });

  test('applyCommand unions the command affects into pendingMutations', () => {
    const glyph = createGlyph({ name: 'A', codepoint: 65, masterId, starter: 'triangle' });
    useProjectStore.getState().applyCommand(projectId, addGlyphCommand({ glyph }));

    const pending = useProjectStore.getState().pendingMutations[projectId]!;
    expect(pending.some((t) => t.kind === 'glyph' && t.glyphId === glyph.id)).toBe(true);
    expect(pending.some((t) => t.kind === 'layer' && t.glyphId === glyph.id)).toBe(true);
  });

  test('undo unions the reverted command affects back into pendingMutations', () => {
    const glyph = createGlyph({ name: 'A', codepoint: 65, masterId, starter: 'triangle' });
    const addCmd = addGlyphCommand({ glyph });
    useProjectStore.getState().applyCommand(projectId, addCmd);
    useProjectStore.getState().markClean(projectId);
    expect(useProjectStore.getState().pendingMutations[projectId]).toBeUndefined();

    useProjectStore.getState().undo(projectId);

    const pending = useProjectStore.getState().pendingMutations[projectId]!;
    expect(pending.length).toBe(addCmd.affects.length);
    for (const target of addCmd.affects) {
      expect(pending).toContainEqual(target);
    }
  });

  test('redo re-applies and emits the same affects', () => {
    const glyph = createGlyph({ name: 'A', codepoint: 65, masterId, starter: 'triangle' });
    const addCmd = addGlyphCommand({ glyph });
    useProjectStore.getState().applyCommand(projectId, addCmd);
    useProjectStore.getState().markClean(projectId);
    useProjectStore.getState().undo(projectId);
    useProjectStore.getState().markClean(projectId);
    expect(useProjectStore.getState().pendingMutations[projectId]).toBeUndefined();

    useProjectStore.getState().redo(projectId);
    const pending = useProjectStore.getState().pendingMutations[projectId]!;
    expect(pending.length).toBe(addCmd.affects.length);
  });

  test('multi-step edits accumulate a deduped target set', () => {
    const glyph = createGlyph({ name: 'A', codepoint: 65, masterId, starter: 'triangle' });
    useProjectStore.getState().applyCommand(projectId, addGlyphCommand({ glyph }));

    const layerId = glyph.layers[0]!.id;
    const contourId = glyph.layers[0]!.contours[0]!.id;
    const pointId = glyph.layers[0]!.contours[0]!.points[0]!.id;
    useProjectStore.getState().applyCommand(
      projectId,
      movePointsCommand({
        glyphId: glyph.id,
        layerId,
        contourId,
        pointIds: [pointId],
        dx: 5,
        dy: 0,
      }),
    );

    const pending = useProjectStore.getState().pendingMutations[projectId]!;
    const layerTargets = pending.filter(
      (t) => t.kind === 'layer' && t.glyphId === glyph.id && t.layerId === layerId,
    );
    expect(layerTargets).toHaveLength(1);
  });
});
