import { Button } from '@/components/ui/button';
import type { Glyph } from '@interrobang/core';
import { movePointsCommand, insertPointCommand, newId } from '@interrobang/core';
import { EditorCanvas, type EditorCanvasHandle } from '@interrobang/editor';
import { useMemo } from 'react';
import type { Ref } from 'react';

import { useEditorStore } from '../stores/editor-store';
import { useProjectStore } from '../stores/project-store';

interface Props {
  projectId: string;
  canvasHandleRef?: Ref<EditorCanvasHandle>;
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export function EditorShell({ projectId, canvasHandleRef }: Props) {
  const proj = useProjectStore((s) => s.openProjects[projectId]);
  const applyCommand = useProjectStore((s) => s.applyCommand);
  const tool = useEditorStore((s) => s.tool);
  const setSelection = useEditorStore((s) => s.setSelection);
  const activeGlyphId = useEditorStore((s) => s.activeGlyphByProject[projectId]);
  const selectionByGlyph = useEditorStore((s) => s.selectionByGlyph);

  const activeGlyph: Glyph | null = useMemo(() => {
    if (!proj) return null;
    const id = activeGlyphId ?? proj.font.glyphOrder[0];
    return id ? (proj.font.glyphs[id] ?? null) : null;
  }, [proj, activeGlyphId]);

  const selection = activeGlyph
    ? (selectionByGlyph[activeGlyph.id] ?? EMPTY_SELECTION)
    : EMPTY_SELECTION;

  if (!proj) return <div className="p-6 text-muted-foreground">Loading project…</div>;
  if (!activeGlyph)
    return (
      <div className="p-6">
        <p className="text-muted-foreground mb-2">No glyphs in this project yet.</p>
        <Button onClick={() => useProjectStore.getState().addGlyph(projectId, 'A')}>
          Add a glyph &quot;A&quot;
        </Button>
      </div>
    );

  const currentGlyph = activeGlyph;

  return (
    <div className="absolute inset-0">
      <EditorCanvas
        ref={canvasHandleRef}
        glyph={currentGlyph}
        selection={selection}
        tool={tool}
        onCommitMove={(pointIds, dx, dy) => {
          const layer = currentGlyph.layers[0];
          if (!layer) return;
          const contour = layer.contours.find((c) => c.points.some((p) => pointIds.includes(p.id)));
          if (!contour) return;
          applyCommand(
            projectId,
            movePointsCommand({
              glyphId: currentGlyph.id,
              layerId: layer.id,
              contourId: contour.id,
              pointIds: [...pointIds],
              dx,
              dy,
            }),
          );
        }}
        onSelectionChange={(ids) => setSelection(currentGlyph.id, ids)}
        onPenClick={(fx, fy) => {
          const layer = currentGlyph.layers[0];
          if (!layer) return;
          const contour = layer.contours[0];
          if (!contour) return;
          applyCommand(
            projectId,
            insertPointCommand({
              glyphId: currentGlyph.id,
              layerId: layer.id,
              contourId: contour.id,
              index: contour.points.length,
              point: { id: newId(), x: fx, y: fy, type: 'line', smooth: false },
            }),
          );
        }}
      />
    </div>
  );
}
