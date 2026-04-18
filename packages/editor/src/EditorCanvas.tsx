import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Glyph } from '@interrobang/core';
import { Viewport } from './viewport.js';
import { drawLayer } from './render.js';
import { hitTest } from './hit-test.js';

export interface LiveEditEvent {
  kind: 'point-drag';
  pointIds: readonly string[];
  dx: number;
  dy: number;
}

export type LiveEditListener = (e: LiveEditEvent) => void;

export interface EditorCanvasHandle {
  setGlyph(glyph: Glyph): void;
  setSelection(ids: ReadonlySet<string>): void;
  setTool(tool: 'select' | 'pen'): void;
  fitToView(): void;
  on(event: 'liveEdit', cb: LiveEditListener): () => void;
}

export interface EditorCanvasProps {
  width: number;
  height: number;
  initialGlyph: Glyph;
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  onPenClick?: (fontX: number, fontY: number) => void;
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(
  function EditorCanvas(
    { width, height, initialGlyph, onCommitMove, onSelectionChange, onPenClick },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const stateRef = useRef({
      glyph: initialGlyph,
      selection: new Set<string>(),
      tool: 'select' as 'select' | 'pen',
      drag: null as null | {
        pointIds: string[];
        startFontX: number;
        startFontY: number;
        lastDx: number;
        lastDy: number;
      },
    });
    const viewportRef = useRef(new Viewport({ canvasWidth: width, canvasHeight: height }));
    const liveListenersRef = useRef(new Set<LiveEditListener>());
    const rafRef = useRef<number | null>(null);

    function scheduleDraw(): void {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        const layer = stateRef.current.glyph.layers[0];
        if (layer) drawLayer(ctx, layer, viewportRef.current, stateRef.current.selection);
      });
    }

    useImperativeHandle(ref, () => ({
      setGlyph(glyph) {
        stateRef.current.glyph = glyph;
        scheduleDraw();
      },
      setSelection(ids) {
        stateRef.current.selection = new Set(ids);
        scheduleDraw();
      },
      setTool(tool) {
        stateRef.current.tool = tool;
      },
      fitToView() {
        viewportRef.current = new Viewport({ canvasWidth: width, canvasHeight: height });
        scheduleDraw();
      },
      on(_event, cb) {
        liveListenersRef.current.add(cb);
        return () => {
          liveListenersRef.current.delete(cb);
        };
      },
    }));

    useEffect(() => {
      scheduleDraw();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width, height]);

    function emitLive(e: LiveEditEvent): void {
      for (const cb of liveListenersRef.current) cb(e);
    }

    function onMouseDown(e: ReactMouseEvent<HTMLCanvasElement>) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const layer = stateRef.current.glyph.layers[0];
      if (!layer) return;

      if (stateRef.current.tool === 'pen') {
        const fontPt = viewportRef.current.screenToFont(sx, sy);
        onPenClick?.(fontPt.x, fontPt.y);
        return;
      }

      const hit = hitTest(layer, viewportRef.current, sx, sy, 8);
      if (hit && hit.kind === 'point') {
        const ids = stateRef.current.selection.has(hit.pointId)
          ? Array.from(stateRef.current.selection)
          : [hit.pointId];
        stateRef.current.selection = new Set(ids);
        onSelectionChange?.(stateRef.current.selection);
        const startFont = viewportRef.current.screenToFont(sx, sy);
        stateRef.current.drag = {
          pointIds: ids,
          startFontX: startFont.x,
          startFontY: startFont.y,
          lastDx: 0,
          lastDy: 0,
        };
        scheduleDraw();
      } else {
        stateRef.current.selection = new Set();
        onSelectionChange?.(stateRef.current.selection);
        scheduleDraw();
      }
    }

    function onMouseMove(e: ReactMouseEvent<HTMLCanvasElement>) {
      const drag = stateRef.current.drag;
      if (!drag) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cur = viewportRef.current.screenToFont(sx, sy);
      const dx = cur.x - drag.startFontX;
      const dy = cur.y - drag.startFontY;
      const stepDx = dx - drag.lastDx;
      const stepDy = dy - drag.lastDy;
      drag.lastDx = dx;
      drag.lastDy = dy;
      stateRef.current.glyph = previewMove(
        stateRef.current.glyph,
        drag.pointIds,
        stepDx,
        stepDy,
      );
      emitLive({ kind: 'point-drag', pointIds: drag.pointIds, dx, dy });
      scheduleDraw();
    }

    function onMouseUp() {
      const drag = stateRef.current.drag;
      if (drag) {
        onCommitMove?.(drag.pointIds, drag.lastDx, drag.lastDy);
        stateRef.current.drag = null;
      }
    }

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        className="editor-canvas"
      />
    );
  },
);

function previewMove(
  glyph: Glyph,
  pointIds: readonly string[],
  dx: number,
  dy: number,
): Glyph {
  const ids = new Set(pointIds);
  return {
    ...glyph,
    layers: glyph.layers.map((layer) => ({
      ...layer,
      contours: layer.contours.map((c) => ({
        ...c,
        points: c.points.map((p) =>
          ids.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p,
        ),
      })),
    })),
  };
}
