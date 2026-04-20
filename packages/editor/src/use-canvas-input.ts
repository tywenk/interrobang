import { useCallback, useLayoutEffect, useReducer, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, MouseEventHandler, RefObject } from 'react';
import type { Glyph } from '@interrobang/core';
import { hitTest } from './hit-test.js';
import type { Viewport } from './viewport.js';
import type { LiveEditEvent } from './editor-canvas.js';

const HIT_TOLERANCE_PX = 8;

function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export type DragState =
  | { kind: 'idle' }
  | {
      kind: 'dragging';
      pointIds: readonly string[];
      startFontX: number;
      startFontY: number;
      lastDx: number;
      lastDy: number;
    };

export type DragAction =
  | {
      type: 'start';
      pointIds: readonly string[];
      startFontX: number;
      startFontY: number;
    }
  | { type: 'update'; dx: number; dy: number }
  | { type: 'end' };

function dragReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case 'start':
      return {
        kind: 'dragging',
        pointIds: action.pointIds,
        startFontX: action.startFontX,
        startFontY: action.startFontY,
        lastDx: 0,
        lastDy: 0,
      };
    case 'update':
      if (state.kind !== 'dragging') return state;
      return { ...state, lastDx: action.dx, lastDy: action.dy };
    case 'end':
      return { kind: 'idle' };
  }
}

export interface UseCanvasInputOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewport: Viewport;
  glyph: Glyph;
  selection: ReadonlySet<string>;
  tool: 'select' | 'pen';
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onPenClick?: (fontX: number, fontY: number) => void;
  emitLive: (e: LiveEditEvent) => void;
  scheduleDraw: () => void;
}

export interface UseCanvasInputResult {
  /** Current drag state — re-renders when the drag transitions. */
  drag: DragState;
  /**
   * Ref mirroring the live drag state. Use inside rAF/draw callbacks where the
   * React-committed `drag` value may lag behind the latest mouse event by one
   * frame.
   */
  dragRef: RefObject<DragState>;
  onMouseDown: MouseEventHandler<HTMLCanvasElement>;
  onMouseMove: MouseEventHandler<HTMLCanvasElement>;
  onMouseUp: MouseEventHandler<HTMLCanvasElement>;
}

/**
 * Owns mouse-down/move/up wiring, hit-test, and the drag state machine.
 * Reads callbacks and incidentally-variable values (viewport, tool, glyph,
 * selection) through refs so the returned handlers don't need re-subscription.
 */
export function useCanvasInput({
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
}: UseCanvasInputOptions): UseCanvasInputResult {
  const [drag, dispatch] = useReducer(dragReducer, { kind: 'idle' });

  const glyphRef = useRef(glyph);
  const selectionRef = useRef(selection);
  const toolRef = useRef(tool);
  const viewportRef = useRef(viewport);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onCommitMoveRef = useRef(onCommitMove);
  const onPenClickRef = useRef(onPenClick);
  const emitLiveRef = useRef(emitLive);
  const scheduleDrawRef = useRef(scheduleDraw);

  useLayoutEffect(() => {
    glyphRef.current = glyph;
  }, [glyph]);
  useLayoutEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useLayoutEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useLayoutEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
  useLayoutEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);
  useLayoutEffect(() => {
    onCommitMoveRef.current = onCommitMove;
  }, [onCommitMove]);
  useLayoutEffect(() => {
    onPenClickRef.current = onPenClick;
  }, [onPenClick]);
  useLayoutEffect(() => {
    emitLiveRef.current = emitLive;
  }, [emitLive]);
  useLayoutEffect(() => {
    scheduleDrawRef.current = scheduleDraw;
  }, [scheduleDraw]);

  // Track the latest drag snapshot synchronously so mouseup/mousemove see
  // the in-flight values even when React hasn't yet committed a re-render.
  const dragRef = useRef<DragState>(drag);
  useLayoutEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  const onMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const layer = glyphRef.current.layers[0];
      if (!layer) return;

      const vp = viewportRef.current;
      if (toolRef.current === 'pen') {
        const fontPt = vp.screenToFont(sx, sy);
        onPenClickRef.current?.(fontPt.x, fontPt.y);
        return;
      }

      const hit = hitTest(layer, vp, sx, sy, HIT_TOLERANCE_PX);
      if (hit && hit.kind === 'point') {
        const sel = selectionRef.current;
        const ids = sel.has(hit.pointId) ? Array.from(sel) : [hit.pointId];
        const nextSelection = new Set(ids);
        if (!sameSet(sel, nextSelection)) onSelectionChangeRef.current?.(nextSelection);
        const startFont = vp.screenToFont(sx, sy);
        const next: DragState = {
          kind: 'dragging',
          pointIds: ids,
          startFontX: startFont.x,
          startFontY: startFont.y,
          lastDx: 0,
          lastDy: 0,
        };
        dragRef.current = next;
        dispatch({
          type: 'start',
          pointIds: ids,
          startFontX: startFont.x,
          startFontY: startFont.y,
        });
        scheduleDrawRef.current();
      } else {
        if (selectionRef.current.size > 0) onSelectionChangeRef.current?.(new Set());
        scheduleDrawRef.current();
      }
    },
    [canvasRef],
  );

  const onMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const current = dragRef.current;
      if (current.kind !== 'dragging') return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cur = viewportRef.current.screenToFont(sx, sy);
      const dx = cur.x - current.startFontX;
      const dy = cur.y - current.startFontY;
      dragRef.current = { ...current, lastDx: dx, lastDy: dy };
      dispatch({ type: 'update', dx, dy });
      emitLiveRef.current({ kind: 'point-drag', pointIds: current.pointIds, dx, dy });
      scheduleDrawRef.current();
    },
    [canvasRef],
  );

  const onMouseUp = useCallback(() => {
    const current = dragRef.current;
    if (current.kind !== 'dragging') return;
    onCommitMoveRef.current?.(current.pointIds, current.lastDx, current.lastDy);
    dragRef.current = { kind: 'idle' };
    dispatch({ type: 'end' });
    // Parent is expected to ship a new glyph prop; schedule a redraw so the
    // preview clears if it doesn't.
    scheduleDrawRef.current();
  }, []);

  return { drag, dragRef, onMouseDown, onMouseMove, onMouseUp };
}
