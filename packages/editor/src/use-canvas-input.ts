import type { Contour, Glyph } from '@interrobang/core';
import { adjacentOffcurves, segmentsOf } from '@interrobang/core';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, MouseEventHandler, RefObject } from 'react';

import type { LiveEditEvent } from './editor-canvas.js';
import { hitTest } from './hit-test.js';
import { selectionEquals, type Selection } from './selection.js';
import type { Viewport } from './viewport.js';

const HIT_TOLERANCE_PX = 8;
const SEGMENT_TOLERANCE_PX = 5;
/** Precision mode delta-scale when ctrl+alt is held mid-drag. */
export const NUDGE_SCALE = 0.1;

export type CanvasTool = 'select' | 'pen' | 'add-point';

export type DragState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'dragging';
      /** Points this drag translates in lock-step. */
      readonly pointIds: readonly string[];
      /**
       * Last-observed screen position; each mousemove accumulates a scaled
       * per-frame delta against this. Reset at mousedown.
       */
      readonly lastSx: number;
      readonly lastSy: number;
      /** Total font-space delta since drag start (scaling applied per frame). */
      readonly lastDx: number;
      readonly lastDy: number;
      /** True when the previous move event saw ctrl+alt held. */
      readonly nudgeRegime: boolean;
    }
  | {
      readonly kind: 'marquee';
      readonly startSx: number;
      readonly startSy: number;
      readonly currentSx: number;
      readonly currentSy: number;
      /** Whether to merge with the pre-marquee selection (shift held at start). */
      readonly additive: boolean;
      /** Snapshot of the selection at marquee start for additive blending. */
      readonly baseSelection: Selection;
    };

export type DragAction =
  | {
      readonly type: 'startDrag';
      readonly pointIds: readonly string[];
      readonly startSx: number;
      readonly startSy: number;
      readonly nudgeRegime: boolean;
    }
  | {
      readonly type: 'updateDrag';
      readonly lastSx: number;
      readonly lastSy: number;
      readonly lastDx: number;
      readonly lastDy: number;
      readonly nudgeRegime: boolean;
    }
  | {
      readonly type: 'startMarquee';
      readonly startSx: number;
      readonly startSy: number;
      readonly additive: boolean;
      readonly baseSelection: Selection;
    }
  | {
      readonly type: 'updateMarquee';
      readonly currentSx: number;
      readonly currentSy: number;
    }
  | { readonly type: 'end' };

function dragReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case 'startDrag':
      return {
        kind: 'dragging',
        pointIds: action.pointIds,
        lastSx: action.startSx,
        lastSy: action.startSy,
        lastDx: 0,
        lastDy: 0,
        nudgeRegime: action.nudgeRegime,
      };
    case 'updateDrag':
      if (state.kind !== 'dragging') return state;
      return {
        ...state,
        lastSx: action.lastSx,
        lastSy: action.lastSy,
        lastDx: action.lastDx,
        lastDy: action.lastDy,
        nudgeRegime: action.nudgeRegime,
      };
    case 'startMarquee':
      return {
        kind: 'marquee',
        startSx: action.startSx,
        startSy: action.startSy,
        currentSx: action.startSx,
        currentSy: action.startSy,
        additive: action.additive,
        baseSelection: action.baseSelection,
      };
    case 'updateMarquee':
      if (state.kind !== 'marquee') return state;
      return { ...state, currentSx: action.currentSx, currentSy: action.currentSy };
    case 'end':
      return { kind: 'idle' };
  }
}

export interface UseCanvasInputOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewport: Viewport;
  glyph: Glyph;
  selection: Selection;
  tool: CanvasTool;
  onSelectionChange?: (next: Selection) => void;
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onPenClick?: (fontX: number, fontY: number) => void;
  /** Alt-click on a line segment in the select tool. */
  onConvertLineSegment?: (contourId: string, toAnchorId: string) => void;
  /** Click on a segment with the add-point tool. */
  onInsertAnchorOnSegment?: (contourId: string, segmentIndex: number, t: number) => void;
  emitLive: (e: LiveEditEvent) => void;
  scheduleDraw: () => void;
}

export interface UseCanvasInputResult {
  drag: DragState;
  dragRef: RefObject<DragState>;
  onMouseDown: MouseEventHandler<HTMLCanvasElement>;
  onMouseMove: MouseEventHandler<HTMLCanvasElement>;
  onMouseUp: MouseEventHandler<HTMLCanvasElement>;
}

/**
 * Owns mouse-down/move/up wiring, hit-test, and the drag state machine.
 * Captures alt-lock semantics at mousedown (frozen for the drag) and reads
 * ctrl+alt live per-frame for precision mode. Escape cancels any in-flight
 * drag or marquee without committing.
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
  onConvertLineSegment,
  onInsertAnchorOnSegment,
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
  const onConvertLineSegmentRef = useRef(onConvertLineSegment);
  const onInsertAnchorOnSegmentRef = useRef(onInsertAnchorOnSegment);
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
    onConvertLineSegmentRef.current = onConvertLineSegment;
  }, [onConvertLineSegment]);
  useLayoutEffect(() => {
    onInsertAnchorOnSegmentRef.current = onInsertAnchorOnSegment;
  }, [onInsertAnchorOnSegment]);
  useLayoutEffect(() => {
    emitLiveRef.current = emitLive;
  }, [emitLive]);
  useLayoutEffect(() => {
    scheduleDrawRef.current = scheduleDraw;
  }, [scheduleDraw]);

  const dragRef = useRef<DragState>(drag);
  useLayoutEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // Escape cancels any in-flight interaction without committing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const cur = dragRef.current;
      if (cur.kind === 'idle') return;
      dragRef.current = { kind: 'idle' };
      dispatch({ type: 'end' });
      scheduleDrawRef.current();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      const activeTool = toolRef.current;

      if (activeTool === 'pen') {
        const fontPt = vp.screenToFont(sx, sy);
        onPenClickRef.current?.(fontPt.x, fontPt.y);
        return;
      }

      const sel = selectionRef.current;
      const alt = e.altKey;
      const shift = e.shiftKey;
      const ctrlAlt = (e.ctrlKey || e.metaKey) && e.altKey;

      const hit = hitTest(layer, vp, sx, sy, {
        selectedAnchors: sel.anchors,
        pointTolerancePx: HIT_TOLERANCE_PX,
        segmentTolerancePx: SEGMENT_TOLERANCE_PX,
      });

      if (hit && hit.kind === 'anchor') {
        const contour = findContour(layer.contours, hit.contourId);
        // Build the drag set: anchor + (alt ? [] : adjacent offcurves). If the
        // hit anchor is already in a multi-anchor selection, expand every
        // selected anchor the same way so the group moves in lock-step.
        const alreadySelected = sel.anchors.has(hit.pointId);
        const anchorIds = alreadySelected ? [...sel.anchors] : [hit.pointId];
        const pointIds = expandDragSet(contour, layer.contours, anchorIds, alt);

        const nextSelection: Selection = alreadySelected
          ? sel
          : { anchors: new Set([hit.pointId]), handles: new Set() };
        if (!selectionEquals(sel, nextSelection)) onSelectionChangeRef.current?.(nextSelection);

        dragRef.current = {
          kind: 'dragging',
          pointIds,
          lastSx: sx,
          lastSy: sy,
          lastDx: 0,
          lastDy: 0,
          nudgeRegime: ctrlAlt,
        };
        dispatch({
          type: 'startDrag',
          pointIds,
          startSx: sx,
          startSy: sy,
          nudgeRegime: ctrlAlt,
        });
        scheduleDrawRef.current();
        return;
      }

      if (hit && hit.kind === 'handle') {
        const nextSelection: Selection = {
          anchors: sel.anchors,
          handles: new Set([hit.pointId]),
        };
        if (!selectionEquals(sel, nextSelection)) onSelectionChangeRef.current?.(nextSelection);
        dragRef.current = {
          kind: 'dragging',
          pointIds: [hit.pointId],
          lastSx: sx,
          lastSy: sy,
          lastDx: 0,
          lastDy: 0,
          nudgeRegime: ctrlAlt,
        };
        dispatch({
          type: 'startDrag',
          pointIds: [hit.pointId],
          startSx: sx,
          startSy: sy,
          nudgeRegime: ctrlAlt,
        });
        scheduleDrawRef.current();
        return;
      }

      if (hit && hit.kind === 'segment') {
        if (activeTool === 'add-point') {
          onInsertAnchorOnSegmentRef.current?.(hit.contourId, hit.segmentIndex, hit.t);
          return;
        }
        if (activeTool === 'select' && alt) {
          const contour = findContour(layer.contours, hit.contourId);
          const seg = contour ? segmentsOf(contour)[hit.segmentIndex] : undefined;
          if (contour && seg && seg.kind === 'line') {
            const toAnchor = contour.points[seg.toIdx]!;
            onConvertLineSegmentRef.current?.(hit.contourId, toAnchor.id);
            return;
          }
          // Not a line or tool mismatch — fall through to marquee.
        }
        // Segment hit without an action configured: clear selection & marquee.
      }

      // Miss (or inert segment hit): start marquee. Shift = additive.
      const base = sel;
      dragRef.current = {
        kind: 'marquee',
        startSx: sx,
        startSy: sy,
        currentSx: sx,
        currentSy: sy,
        additive: shift,
        baseSelection: base,
      };
      dispatch({
        type: 'startMarquee',
        startSx: sx,
        startSy: sy,
        additive: shift,
        baseSelection: base,
      });
      if (!shift && (sel.anchors.size > 0 || sel.handles.size > 0)) {
        onSelectionChangeRef.current?.({ anchors: new Set(), handles: new Set() });
      }
      scheduleDrawRef.current();
    },
    [canvasRef],
  );

  const onMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const current = dragRef.current;
      if (current.kind === 'idle') return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (current.kind === 'marquee') {
        const next: DragState = { ...current, currentSx: sx, currentSy: sy };
        dragRef.current = next;
        dispatch({ type: 'updateMarquee', currentSx: sx, currentSy: sy });
        scheduleDrawRef.current();
        return;
      }

      // Dragging points: per-frame scaled accumulation.
      // The modifier state at the END of the event scales the delta since the
      // previous event. This makes "hold ctrl+alt mid-drag" feel smooth and
      // commutative: prior motion keeps its regime, new motion uses the new
      // one. Sub-pixel drift is avoided because the font delta is derived
      // from a single screenToFont pair per frame.
      const vp = viewportRef.current;
      const cur = vp.screenToFont(sx, sy);
      const prev = vp.screenToFont(current.lastSx, current.lastSy);
      const nowNudge = (e.ctrlKey || e.metaKey) && e.altKey;
      const scale = nowNudge ? NUDGE_SCALE : 1;
      const totalDx = current.lastDx + (cur.x - prev.x) * scale;
      const totalDy = current.lastDy + (cur.y - prev.y) * scale;

      const next: DragState = {
        ...current,
        lastSx: sx,
        lastSy: sy,
        lastDx: totalDx,
        lastDy: totalDy,
        nudgeRegime: nowNudge,
      };
      dragRef.current = next;
      dispatch({
        type: 'updateDrag',
        lastSx: sx,
        lastSy: sy,
        lastDx: totalDx,
        lastDy: totalDy,
        nudgeRegime: nowNudge,
      });
      emitLiveRef.current({
        kind: 'point-drag',
        pointIds: current.pointIds,
        dx: totalDx,
        dy: totalDy,
      });
      scheduleDrawRef.current();
    },
    [canvasRef],
  );

  const onMouseUp = useCallback(() => {
    const current = dragRef.current;
    if (current.kind === 'idle') return;

    if (current.kind === 'dragging') {
      onCommitMoveRef.current?.(current.pointIds, current.lastDx, current.lastDy);
      dragRef.current = { kind: 'idle' };
      dispatch({ type: 'end' });
      scheduleDrawRef.current();
      return;
    }

    // Marquee commit: collect anchors whose screen position lies inside the box.
    const vp = viewportRef.current;
    const layer = glyphRef.current.layers[0];
    const box = {
      x0: Math.min(current.startSx, current.currentSx),
      y0: Math.min(current.startSy, current.currentSy),
      x1: Math.max(current.startSx, current.currentSx),
      y1: Math.max(current.startSy, current.currentSy),
    };
    const hitAnchors = new Set<string>();
    if (layer && (box.x1 > box.x0 + 1 || box.y1 > box.y0 + 1)) {
      for (const contour of layer.contours) {
        for (const p of contour.points) {
          if (p.type === 'offcurve') continue;
          const s = vp.fontToScreen(p.x, p.y);
          if (s.x >= box.x0 && s.x <= box.x1 && s.y >= box.y0 && s.y <= box.y1) {
            hitAnchors.add(p.id);
          }
        }
      }
    }
    const nextSelection: Selection = current.additive
      ? {
          anchors: mergeSets(current.baseSelection.anchors, hitAnchors),
          handles: current.baseSelection.handles,
        }
      : { anchors: hitAnchors, handles: new Set() };
    const sel = selectionRef.current;
    if (!selectionEquals(sel, nextSelection)) onSelectionChangeRef.current?.(nextSelection);
    dragRef.current = { kind: 'idle' };
    dispatch({ type: 'end' });
    scheduleDrawRef.current();
  }, []);

  return { drag, dragRef, onMouseDown, onMouseMove, onMouseUp };
}

function findContour(contours: readonly Contour[], contourId: string): Contour | undefined {
  return contours.find((c) => c.id === contourId);
}

function mergeSets(a: ReadonlySet<string>, b: ReadonlySet<string>): ReadonlySet<string> {
  if (b.size === 0) return a;
  const out = new Set(a);
  for (const v of b) out.add(v);
  return out;
}

/**
 * Produce the point-id set that a drag across these anchors should move.
 *
 * Default: each anchor plus its adjacent offcurves (so handles travel with
 * their anchor). `altLock` (alt held at mousedown) collapses to anchors only.
 * The returned list is deduplicated; shared handles between adjacent selected
 * anchors are included once.
 */
function expandDragSet(
  primaryContour: Contour | undefined,
  allContours: readonly Contour[],
  anchorIds: readonly string[],
  altLock: boolean,
): readonly string[] {
  if (altLock) return [...anchorIds];
  const out = new Set<string>(anchorIds);
  const wanted = new Set(anchorIds);
  const contoursToScan = primaryContour
    ? [primaryContour, ...allContours.filter((c) => c !== primaryContour)]
    : allContours;
  for (const contour of contoursToScan) {
    for (let i = 0; i < contour.points.length; i++) {
      const p = contour.points[i]!;
      if (!wanted.has(p.id)) continue;
      const adj = adjacentOffcurves(contour, i);
      if (adj.in !== undefined) out.add(contour.points[adj.in]!.id);
      if (adj.out !== undefined) out.add(contour.points[adj.out]!.id);
    }
  }
  return [...out];
}
