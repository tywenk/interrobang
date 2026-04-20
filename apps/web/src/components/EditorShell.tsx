import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Ref } from 'react';
import type { Glyph } from '@interrobang/core';
import { movePointsCommand, insertPointCommand, newId } from '@interrobang/core';
import { EditorCanvas, type EditorCanvasHandle } from '@interrobang/editor';
import { useProjectStore } from '../stores/project-store';
import { useEditorStore } from '../stores/editor-store';
import { Button } from '@/components/ui/button';
import { ExportButton } from './ExportButton';

interface Props {
  projectId: string;
  canvasHandleRef?: Ref<EditorCanvasHandle>;
}

export function EditorShell({ projectId, canvasHandleRef }: Props) {
  const proj = useProjectStore((s) => s.openProjects[projectId]);
  const applyCommand = useProjectStore((s) => s.applyCommand);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const tool = useEditorStore((s) => s.tool);
  const setSelection = useEditorStore((s) => s.setSelection);
  const activeGlyphId = useEditorStore((s) => s.activeGlyphByProject[projectId]);

  const internalRef = useRef<EditorCanvasHandle | null>(null);
  const setRefs = useCallback(
    (handle: EditorCanvasHandle | null) => {
      internalRef.current = handle;
      if (typeof canvasHandleRef === 'function') canvasHandleRef(handle);
      else if (canvasHandleRef) canvasHandleRef.current = handle;
    },
    [canvasHandleRef],
  );

  const activeGlyph: Glyph | null = useMemo(() => {
    if (!proj) return null;
    const id = activeGlyphId ?? proj.font.glyphOrder[0];
    return id ? (proj.font.glyphs[id] ?? null) : null;
  }, [proj, activeGlyphId]);

  useEffect(() => {
    if (internalRef.current && activeGlyph) internalRef.current.setGlyph(activeGlyph);
  }, [activeGlyph]);

  useEffect(() => {
    internalRef.current?.setTool(tool);
  }, [tool]);

  if (!proj) return <div className="p-6 text-muted-foreground">Loading project…</div>;
  if (!activeGlyph)
    return (
      <div className="p-6">
        <p className="text-muted-foreground mb-2">No glyphs in this project yet.</p>
        <Button onClick={() => requestStarterGlyph(projectId)}>Add a glyph &quot;A&quot;</Button>
      </div>
    );

  const currentGlyph = activeGlyph;

  return (
    <div className="absolute inset-0">
      <EditorCanvas
        ref={setRefs}
        initialGlyph={currentGlyph}
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
      <div className="absolute bottom-4 left-4 flex gap-2">
        <Button variant="outline" onClick={() => undo(projectId)}>
          Undo
        </Button>
        <Button variant="outline" onClick={() => redo(projectId)}>
          Redo
        </Button>
        <ExportButton projectId={projectId} />
      </div>
    </div>
  );
}

function requestStarterGlyph(projectId: string): void {
  document.dispatchEvent(new CustomEvent('interrobang:add-starter', { detail: { projectId } }));
}
