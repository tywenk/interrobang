import { useCallback, useImperativeHandle, useRef, forwardRef } from 'react';
import type { RefObject } from 'react';
import type { Glyph } from '@interrobang/core';
import { drawLayer } from './render.js';
import type { Viewport } from './viewport.js';
import { useCanvasSize } from './use-canvas-size.js';
import { useCanvasInput } from './use-canvas-input.js';
import type { DragState } from './use-canvas-input.js';

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

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { glyph, selection, tool, onCommitMove, onSelectionChange, onPenClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveListenersRef = useRef(new Set<LiveEditListener>());

  // Refs mirroring props/hook state so the rAF draw callback always reads
  // fresh values even if React hasn't yet committed a re-render.
  const glyphRef = useRef(glyph);
  const selectionRef = useRef(selection);
  glyphRef.current = glyph;
  selectionRef.current = selection;

  // Forward-declared accessors for values the draw callback needs but which
  // originate from hooks that run after this closure is created.
  const viewportRef = useRef<Viewport | null>(null);
  const dragRefRef = useRef<RefObject<DragState> | null>(null);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const drag = dragRefRef.current?.current;
    const drawnGlyph =
      drag && drag.kind === 'dragging' && (drag.lastDx !== 0 || drag.lastDy !== 0)
        ? previewMove(glyphRef.current, drag.pointIds, drag.lastDx, drag.lastDy)
        : glyphRef.current;
    const layer = drawnGlyph.layers[0];
    if (layer) drawLayer(ctx, layer, vp, selectionRef.current);
  }, []);

  const { viewport, scheduleDraw, fitToGlyph } = useCanvasSize({
    containerRef,
    canvasRef,
    glyph,
    draw,
  });
  viewportRef.current = viewport;

  const emitLive = useCallback((e: LiveEditEvent) => {
    for (const cb of liveListenersRef.current) cb(e);
  }, []);

  const { dragRef, onMouseDown, onMouseMove, onMouseUp } = useCanvasInput({
    canvasRef,
    viewport,
    glyph,
    selection,
    tool,
    onSelectionChange,
    onCommitMove,
    onPenClick,
    emitLive,
    scheduleDraw,
  });
  dragRefRef.current = dragRef;

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
