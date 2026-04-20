import { useCallback, useImperativeHandle, useLayoutEffect, useRef, forwardRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Glyph } from '@interrobang/core';
import { drawLayer } from './render.js';
import { hitTest } from './hit-test.js';
import { useCanvasSize } from './use-canvas-size.js';

export interface LiveEditEvent {
  kind: 'point-drag';
  pointIds: readonly string[];
  dx: number;
  dy: number;
}

export type LiveEditListener = (e: LiveEditEvent) => void;

export interface EditorCanvasHandle {
  fitToView(): void;
  on(event: 'liveEdit', cb: LiveEditListener): () => void;
}

export interface EditorCanvasProps {
  glyph: Glyph;
  selection: ReadonlySet<string>;
  tool: 'select' | 'pen';
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  onPenClick?: (fontX: number, fontY: number) => void;
}

interface DragState {
  pointIds: readonly string[];
  startFontX: number;
  startFontY: number;
  lastDx: number;
  lastDy: number;
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { glyph, selection, tool, onCommitMove, onSelectionChange, onPenClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Prop mirrors so event handlers read fresh state without re-subscribing.
  const glyphRef = useRef(glyph);
  const selectionRef = useRef<ReadonlySet<string>>(selection);
  const toolRef = useRef(tool);
  const prevGlyphIdRef = useRef(glyph.id);

  const dragRef = useRef<DragState | null>(null);
  const liveListenersRef = useRef(new Set<LiveEditListener>());

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const drag = dragRef.current;
    const drawnGlyph =
      drag && (drag.lastDx !== 0 || drag.lastDy !== 0)
        ? previewMove(glyphRef.current, drag.pointIds, drag.lastDx, drag.lastDy)
        : glyphRef.current;
    const layer = drawnGlyph.layers[0];
    if (layer) drawLayer(ctx, layer, viewportRef.current!, selectionRef.current);
  }, []);

  const { viewport, scheduleDraw, fitToGlyph } = useCanvasSize({
    containerRef,
    canvasRef,
    glyph,
    draw,
  });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Keep refs in sync with the latest props. useLayoutEffect so event
  // handlers invoked before the next paint see fresh values.
  useLayoutEffect(() => {
    glyphRef.current = glyph;
    const prevId = prevGlyphIdRef.current;
    if (glyph.id !== prevId) {
      viewport.fitToGlyph(glyph);
      prevGlyphIdRef.current = glyph.id;
    }
    scheduleDraw();
  }, [glyph, viewport, scheduleDraw]);

  useLayoutEffect(() => {
    selectionRef.current = selection;
    scheduleDraw();
  }, [selection, scheduleDraw]);

  useLayoutEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useImperativeHandle(
    ref,
    () => ({
      fitToView() {
        fitToGlyph();
      },
      on(_event, cb) {
        liveListenersRef.current.add(cb);
        return () => {
          liveListenersRef.current.delete(cb);
        };
      },
    }),
    [fitToGlyph],
  );

  function emitLive(e: LiveEditEvent): void {
    for (const cb of liveListenersRef.current) cb(e);
  }

  function onMouseDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const layer = glyphRef.current.layers[0];
    if (!layer) return;

    if (toolRef.current === 'pen') {
      const fontPt = viewport.screenToFont(sx, sy);
      onPenClick?.(fontPt.x, fontPt.y);
      return;
    }

    const hit = hitTest(layer, viewport, sx, sy, 8);
    if (hit && hit.kind === 'point') {
      const ids = selectionRef.current.has(hit.pointId)
        ? Array.from(selectionRef.current)
        : [hit.pointId];
      onSelectionChange?.(new Set(ids));
      const startFont = viewport.screenToFont(sx, sy);
      dragRef.current = {
        pointIds: ids,
        startFontX: startFont.x,
        startFontY: startFont.y,
        lastDx: 0,
        lastDy: 0,
      };
      scheduleDraw();
    } else {
      onSelectionChange?.(new Set());
      scheduleDraw();
    }
  }

  function onMouseMove(e: ReactMouseEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cur = viewport.screenToFont(sx, sy);
    const dx = cur.x - drag.startFontX;
    const dy = cur.y - drag.startFontY;
    drag.lastDx = dx;
    drag.lastDy = dy;
    emitLive({ kind: 'point-drag', pointIds: drag.pointIds, dx, dy });
    scheduleDraw();
  }

  function onMouseUp() {
    const drag = dragRef.current;
    if (drag) {
      onCommitMove?.(drag.pointIds, drag.lastDx, drag.lastDy);
      dragRef.current = null;
      // Parent is expected to send back a new glyph; until then redraw without
      // the preview so the canvas doesn't look stuck.
      scheduleDraw();
    }
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        className="editor-canvas block"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
});

function previewMove(glyph: Glyph, pointIds: readonly string[], dx: number, dy: number): Glyph {
  const ids = new Set(pointIds);
  return {
    ...glyph,
    layers: glyph.layers.map((layer) => ({
      ...layer,
      contours: layer.contours.map((c) => ({
        ...c,
        points: c.points.map((p) => (ids.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
      })),
    })),
  };
}
