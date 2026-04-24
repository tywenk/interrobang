import type { Glyph } from '@interrobang/core';
import { useCallback, useImperativeHandle, useRef, forwardRef } from 'react';
import type { RefObject } from 'react';

import { drawLayer, previewMove } from './render.js';
import type { Selection } from './selection.js';
import { useCanvasInput } from './use-canvas-input.js';
import type { CanvasTool, DragState } from './use-canvas-input.js';
import { useCanvasSize } from './use-canvas-size.js';
import type { Viewport } from './viewport.js';

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

export type { CanvasTool };

export interface EditorCanvasProps {
  glyph: Glyph;
  selection: Selection;
  tool: CanvasTool;
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onSelectionChange?: (next: Selection) => void;
  onPenClick?: (fontX: number, fontY: number) => void;
  onConvertLineSegment?: (contourId: string, toAnchorId: string) => void;
  onInsertAnchorOnSegment?: (contourId: string, segmentIndex: number, t: number) => void;
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  {
    glyph,
    selection,
    tool,
    onCommitMove,
    onSelectionChange,
    onPenClick,
    onConvertLineSegment,
    onInsertAnchorOnSegment,
  },
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
    if (!layer) return;
    const marquee =
      drag && drag.kind === 'marquee'
        ? { sx0: drag.startSx, sy0: drag.startSy, sx1: drag.currentSx, sy1: drag.currentSy }
        : undefined;
    drawLayer(ctx, layer, vp, { selection: selectionRef.current, marquee });
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
    onConvertLineSegment,
    onInsertAnchorOnSegment,
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
