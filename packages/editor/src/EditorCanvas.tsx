import { useEffect, useImperativeHandle, useLayoutEffect, useRef, forwardRef } from 'react';
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
  initialGlyph: Glyph;
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  onPenClick?: (fontX: number, fontY: number) => void;
}

const INITIAL_SIZE = { width: 800, height: 600 };

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(
  function EditorCanvas({ initialGlyph, onCommitMove, onSelectionChange, onPenClick }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
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
      fitted: false,
    });
    const viewportRef = useRef(
      new Viewport({ canvasWidth: INITIAL_SIZE.width, canvasHeight: INITIAL_SIZE.height }),
    );
    const sizeRef = useRef({ ...INITIAL_SIZE, dpr: 1 });
    const liveListenersRef = useRef(new Set<LiveEditListener>());
    const rafRef = useRef<number | null>(null);

    function scheduleDraw(): void {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;
        const { dpr } = sizeRef.current;
        // Reset transform, clear the backing store in bitmap pixels, then
        // scale so subsequent drawing code works in CSS pixels.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const layer = stateRef.current.glyph.layers[0];
        if (layer) drawLayer(ctx, layer, viewportRef.current, stateRef.current.selection);
      });
    }

    function applySize(cssWidth: number, cssHeight: number): void {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const bitmapW = Math.max(1, Math.round(cssWidth * dpr));
      const bitmapH = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== bitmapW) canvas.width = bitmapW;
      if (canvas.height !== bitmapH) canvas.height = bitmapH;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      const prev = sizeRef.current;
      sizeRef.current = { width: cssWidth, height: cssHeight, dpr };
      viewportRef.current.resize(cssWidth, cssHeight);
      // Refit on the first sizing and whenever the container grows (or shrinks)
      // substantially — typical when the first measurement happened during a
      // layout transition and the real size arrived via ResizeObserver.
      const grew =
        stateRef.current.fitted &&
        (cssWidth > prev.width * 1.5 ||
          cssHeight > prev.height * 1.5 ||
          cssWidth * 1.5 < prev.width ||
          cssHeight * 1.5 < prev.height);
      if (!stateRef.current.fitted || grew) {
        viewportRef.current.fitToGlyph(stateRef.current.glyph);
        stateRef.current.fitted = true;
      }
      scheduleDraw();
    }

    useLayoutEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      applySize(rect.width || INITIAL_SIZE.width, rect.height || INITIAL_SIZE.height);
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const cr = entry.contentRect;
        applySize(cr.width, cr.height);
      });
      ro.observe(container);
      return () => ro.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        setGlyph(glyph) {
          const prevId = stateRef.current.glyph.id;
          stateRef.current.glyph = glyph;
          if (glyph.id !== prevId) {
            viewportRef.current.fitToGlyph(glyph);
          }
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
          viewportRef.current.fitToGlyph(stateRef.current.glyph);
          scheduleDraw();
        },
        on(_event, cb) {
          liveListenersRef.current.add(cb);
          return () => {
            liveListenersRef.current.delete(cb);
          };
        },
      }),
      [],
    );

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
      stateRef.current.glyph = previewMove(stateRef.current.glyph, drag.pointIds, stepDx, stepDy);
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
