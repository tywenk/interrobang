import { useImperativeHandle, useLayoutEffect, useRef, forwardRef } from 'react';
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

const INITIAL_SIZE = { width: 800, height: 600 };

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
  const fittedRef = useRef(false);

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
      const drag = dragRef.current;
      const drawnGlyph =
        drag && (drag.lastDx !== 0 || drag.lastDy !== 0)
          ? previewMove(glyphRef.current, drag.pointIds, drag.lastDx, drag.lastDy)
          : glyphRef.current;
      const layer = drawnGlyph.layers[0];
      if (layer) drawLayer(ctx, layer, viewportRef.current, selectionRef.current);
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
      fittedRef.current &&
      (cssWidth > prev.width * 1.5 ||
        cssHeight > prev.height * 1.5 ||
        cssWidth * 1.5 < prev.width ||
        cssHeight * 1.5 < prev.height);
    if (!fittedRef.current || grew) {
      viewportRef.current.fitToGlyph(glyphRef.current);
      fittedRef.current = true;
    }
    scheduleDraw();
  }

  // Keep refs in sync with the latest props. useLayoutEffect so event
  // handlers invoked before the next paint see fresh values.
  useLayoutEffect(() => {
    glyphRef.current = glyph;
    const prevId = prevGlyphIdRef.current;
    if (glyph.id !== prevId) {
      viewportRef.current.fitToGlyph(glyph);
      prevGlyphIdRef.current = glyph.id;
    }
    scheduleDraw();
  }, [glyph]);

  useLayoutEffect(() => {
    selectionRef.current = selection;
    scheduleDraw();
  }, [selection]);

  useLayoutEffect(() => {
    toolRef.current = tool;
  }, [tool]);

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
      fitToView() {
        viewportRef.current.fitToGlyph(glyphRef.current);
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
    const layer = glyphRef.current.layers[0];
    if (!layer) return;

    if (toolRef.current === 'pen') {
      const fontPt = viewportRef.current.screenToFont(sx, sy);
      onPenClick?.(fontPt.x, fontPt.y);
      return;
    }

    const hit = hitTest(layer, viewportRef.current, sx, sy, 8);
    if (hit && hit.kind === 'point') {
      const ids = selectionRef.current.has(hit.pointId)
        ? Array.from(selectionRef.current)
        : [hit.pointId];
      onSelectionChange?.(new Set(ids));
      const startFont = viewportRef.current.screenToFont(sx, sy);
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
    const cur = viewportRef.current.screenToFont(sx, sy);
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
