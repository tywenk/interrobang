import type { Glyph } from '@interrobang/core';
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, test, vi } from 'vitest';

import type { LiveEditEvent } from './editor-canvas.js';
import { EMPTY_SELECTION, makeSelection, type Selection } from './selection.js';
import { NUDGE_SCALE, useCanvasInput, type CanvasTool } from './use-canvas-input.js';
import { Viewport } from './viewport.js';

/* ──────────────────────────────────────────────────────────────────────
 * Fixtures
 * ────────────────────────────────────────────────────────────────────── */

function makeTriangle(): Glyph {
  return {
    id: 'G',
    name: 'G',
    advanceWidth: 500,
    unicodeCodepoint: null,
    revision: 1,
    layers: [
      {
        id: 'L1',
        masterId: 'M1',
        components: [],
        anchors: [],
        contours: [
          {
            id: 'C1',
            closed: true,
            points: [
              { id: 'p1', x: 0, y: 0, type: 'line', smooth: false },
              { id: 'p2', x: 100, y: 0, type: 'line', smooth: false },
              { id: 'p3', x: 100, y: 100, type: 'line', smooth: false },
            ],
          },
        ],
      },
    ],
  };
}

/** A glyph with one cubic segment a→b and its two offcurves. */
function makeCubicGlyph(): Glyph {
  return {
    id: 'G',
    name: 'G',
    advanceWidth: 500,
    unicodeCodepoint: null,
    revision: 1,
    layers: [
      {
        id: 'L1',
        masterId: 'M1',
        components: [],
        anchors: [],
        contours: [
          {
            id: 'C1',
            closed: false,
            points: [
              { id: 'a', x: 0, y: 0, type: 'line', smooth: false },
              { id: 'h1', x: 0, y: 100, type: 'offcurve', smooth: false },
              { id: 'h2', x: 100, y: 100, type: 'offcurve', smooth: false },
              { id: 'b', x: 100, y: 0, type: 'curve', smooth: false },
            ],
          },
        ],
      },
    ],
  };
}

interface HarnessArgs {
  glyph: Glyph;
  selection: Selection;
  tool: CanvasTool;
  onSelectionChange?: (sel: Selection) => void;
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onPenClick?: (fx: number, fy: number) => void;
  onConvertLineSegment?: (contourId: string, toAnchorId: string) => void;
  onInsertAnchorOnSegment?: (contourId: string, segmentIndex: number, t: number) => void;
  emitLive?: (e: LiveEditEvent) => void;
  scheduleDraw?: () => void;
  viewport: Viewport;
}

function useHarness(args: HarnessArgs) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!canvasRef.current) {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({
        width: 800,
        height: 600,
        top: 0,
        left: 0,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON() {},
      }) as DOMRect;
    canvasRef.current = canvas;
  }
  return {
    canvasRef,
    input: useCanvasInput({
      canvasRef,
      viewport: args.viewport,
      glyph: args.glyph,
      selection: args.selection,
      tool: args.tool,
      onSelectionChange: args.onSelectionChange,
      onCommitMove: args.onCommitMove,
      onPenClick: args.onPenClick,
      onConvertLineSegment: args.onConvertLineSegment,
      onInsertAnchorOnSegment: args.onInsertAnchorOnSegment,
      emitLive: args.emitLive ?? (() => {}),
      scheduleDraw: args.scheduleDraw ?? (() => {}),
    }),
  };
}

interface MouseOpts {
  alt?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

/** Shape a fake React MouseEvent the handler needs (clientX/Y + modifiers). */
function mouseEvent(
  clientX: number,
  clientY: number,
  opts: MouseOpts = {},
): React.MouseEvent<HTMLCanvasElement> {
  return {
    clientX,
    clientY,
    altKey: opts.alt ?? false,
    shiftKey: opts.shift ?? false,
    ctrlKey: opts.ctrl ?? false,
    metaKey: opts.meta ?? false,
  } as unknown as React.MouseEvent<HTMLCanvasElement>;
}

/* ──────────────────────────────────────────────────────────────────────
 * Core drag (preserved behavior)
 * ────────────────────────────────────────────────────────────────────── */

describe('useCanvasInput — drag basics', () => {
  test('mouse-down on a point selects it and starts a drag', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onSelectionChange = vi.fn();
    const scheduleDraw = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        onSelectionChange,
        scheduleDraw,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 300));
    });

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    const sel = onSelectionChange.mock.calls[0]?.[0] as Selection;
    expect([...sel.anchors]).toEqual(['p1']);
    expect(result.current.input.dragRef.current.kind).toBe('dragging');
    expect(scheduleDraw).toHaveBeenCalled();
  });

  test('mouse-move during drag emits liveEdit with font-space deltas', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const emitLive = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        emitLive,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 300));
      result.current.input.onMouseMove(mouseEvent(410, 320));
    });

    const ev = emitLive.mock.calls[0]?.[0] as LiveEditEvent;
    expect(ev.dx).toBeCloseTo(10);
    expect(ev.dy).toBeCloseTo(-20);
  });

  test('mouse-up commits final dx/dy and resets drag', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onCommitMove = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        onCommitMove,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 300));
      result.current.input.onMouseMove(mouseEvent(430, 330));
      result.current.input.onMouseUp(mouseEvent(430, 330));
    });

    const [ids, dx, dy] = onCommitMove.mock.calls[0] ?? [];
    expect(ids).toEqual(['p1']);
    expect(dx).toBeCloseTo(30);
    expect(dy).toBeCloseTo(-30);
    expect(result.current.input.dragRef.current.kind).toBe('idle');
  });

  test('pen tool routes mouse-down to onPenClick with font coords', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onPenClick = vi.fn();
    const onSelectionChange = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'pen',
        onPenClick,
        onSelectionChange,
        viewport,
      }),
    );

    act(() => result.current.input.onMouseDown(mouseEvent(500, 200)));
    expect(onPenClick).toHaveBeenCalledTimes(1);
    const [fx, fy] = onPenClick.mock.calls[0] ?? [];
    expect(fx).toBeCloseTo(100);
    expect(fy).toBeCloseTo(100);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * Anchor drag expansion + alt-lock
 * ────────────────────────────────────────────────────────────────────── */

describe('useCanvasInput — anchor drag expansion', () => {
  test('dragging an anchor pulls its adjacent offcurves along by default', () => {
    const glyph = makeCubicGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onCommitMove = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        onCommitMove,
        viewport,
      }),
    );

    // Anchor 'a' at font (0,0) → screen (400, 300).
    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 300));
      result.current.input.onMouseMove(mouseEvent(410, 300));
      result.current.input.onMouseUp(mouseEvent(410, 300));
    });

    const [ids] = onCommitMove.mock.calls[0] ?? [];
    // Anchor 'a' + its outgoing offcurve 'h1'. (Anchor 'a' has no 'in' in open contour.)
    const set = new Set(ids as string[]);
    expect(set.has('a')).toBe(true);
    expect(set.has('h1')).toBe(true);
    expect(set.has('h2')).toBe(false);
  });

  test('alt held at mousedown collapses drag set to the anchor only', () => {
    const glyph = makeCubicGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onCommitMove = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        onCommitMove,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 300, { alt: true }));
      result.current.input.onMouseMove(mouseEvent(410, 300, { alt: true }));
      result.current.input.onMouseUp(mouseEvent(410, 300));
    });

    const [ids] = onCommitMove.mock.calls[0] ?? [];
    expect(ids).toEqual(['a']);
  });

  test('dragging a selected anchor inside a multi-selection moves all selected anchors + their handles', () => {
    const glyph = makeCubicGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onCommitMove = vi.fn();

    // Selection already has both anchors.
    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: makeSelection(['a', 'b']),
        tool: 'select',
        onCommitMove,
        viewport,
      }),
    );

    // Click on 'a' (part of selection).
    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 300));
      result.current.input.onMouseMove(mouseEvent(410, 300));
      result.current.input.onMouseUp(mouseEvent(410, 300));
    });

    const [ids] = onCommitMove.mock.calls[0] ?? [];
    const set = new Set(ids as string[]);
    // Both anchors + both offcurves.
    expect([...set].sort()).toEqual(['a', 'b', 'h1', 'h2']);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * Handle selection & drag
 * ────────────────────────────────────────────────────────────────────── */

describe('useCanvasInput — handle selection & drag', () => {
  test('clicking a handle (when parent anchor selected) moves only that handle', () => {
    const glyph = makeCubicGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onCommitMove = vi.fn();
    const onSelectionChange = vi.fn();

    // Pre-select anchor 'a' so its outgoing handle 'h1' becomes hittable.
    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: makeSelection(['a']),
        tool: 'select',
        onCommitMove,
        onSelectionChange,
        viewport,
      }),
    );

    // h1 at font (0, 100) → screen (400, 300 - 100) = (400, 200).
    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 200));
      result.current.input.onMouseMove(mouseEvent(410, 200));
      result.current.input.onMouseUp(mouseEvent(410, 200));
    });

    const [ids] = onCommitMove.mock.calls[0] ?? [];
    expect(ids).toEqual(['h1']);
    // Parent anchor selection preserved, handle added to handles set.
    const sel = onSelectionChange.mock.calls[0]?.[0] as Selection;
    expect([...sel.anchors]).toEqual(['a']);
    expect([...sel.handles]).toEqual(['h1']);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * Marquee selection
 * ────────────────────────────────────────────────────────────────────── */

describe('useCanvasInput — marquee selection', () => {
  test('mouse-down in empty space starts a marquee', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });

    const { result } = renderHook(() =>
      useHarness({ glyph, selection: EMPTY_SELECTION, tool: 'select', viewport }),
    );

    act(() => result.current.input.onMouseDown(mouseEvent(10, 10)));
    const d = result.current.input.dragRef.current;
    expect(d.kind).toBe('marquee');
    if (d.kind === 'marquee') {
      expect(d.startSx).toBe(10);
      expect(d.startSy).toBe(10);
      expect(d.additive).toBe(false);
    }
  });

  test('mouse-move during marquee tracks the cursor', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });

    const { result } = renderHook(() =>
      useHarness({ glyph, selection: EMPTY_SELECTION, tool: 'select', viewport }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(10, 10));
      result.current.input.onMouseMove(mouseEvent(60, 80));
    });
    const d = result.current.input.dragRef.current;
    expect(d.kind).toBe('marquee');
    if (d.kind === 'marquee') {
      expect(d.currentSx).toBe(60);
      expect(d.currentSy).toBe(80);
    }
  });

  test('mouse-up on a marquee selects anchors whose screen position lies inside the box', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onSelectionChange = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        onSelectionChange,
        viewport,
      }),
    );

    // Anchors: p1 screen (400,300), p2 (500,300), p3 (500,200).
    // Start marquee well OUTSIDE point tolerance (8px), drag to cover p1+p2
    // but not p3 (which is at y=200).
    act(() => {
      result.current.input.onMouseDown(mouseEvent(350, 250));
      result.current.input.onMouseMove(mouseEvent(550, 350));
      result.current.input.onMouseUp(mouseEvent(550, 350));
    });
    const sel = onSelectionChange.mock.calls.at(-1)?.[0] as Selection;
    expect([...sel.anchors].sort()).toEqual(['p1', 'p2']);
    expect([...sel.handles]).toEqual([]);
  });

  test('shift-drag marquee is additive — preserves prior selection', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onSelectionChange = vi.fn();

    // Start with p3 selected; marquee only covers p1+p2; expect union.
    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: makeSelection(['p3']),
        tool: 'select',
        onSelectionChange,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(350, 250, { shift: true }));
      result.current.input.onMouseMove(mouseEvent(550, 350, { shift: true }));
      result.current.input.onMouseUp(mouseEvent(550, 350));
    });
    const sel = onSelectionChange.mock.calls.at(-1)?.[0] as Selection;
    expect([...sel.anchors].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  test('empty marquee (no anchors inside) replaces non-shift selection with empty', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onSelectionChange = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: makeSelection(['p3']),
        tool: 'select',
        onSelectionChange,
        viewport,
      }),
    );

    // A box far from every anchor.
    act(() => {
      result.current.input.onMouseDown(mouseEvent(10, 10));
      result.current.input.onMouseMove(mouseEvent(30, 30));
      result.current.input.onMouseUp(mouseEvent(30, 30));
    });
    // Non-shift miss clears at mousedown already; mouseup commits empty anchors.
    const lastCall = onSelectionChange.mock.calls.at(-1)?.[0] as Selection;
    expect([...lastCall.anchors]).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * Nudge / precision mode
 * ────────────────────────────────────────────────────────────────────── */

describe('useCanvasInput — nudge mode (ctrl+alt)', () => {
  test('ctrl+alt at mousedown puts the drag into the nudge regime', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const emitLive = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        emitLive,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 300, { ctrl: true, alt: true }));
      result.current.input.onMouseMove(mouseEvent(410, 300, { ctrl: true, alt: true }));
    });
    const ev = emitLive.mock.calls[0]?.[0] as LiveEditEvent;
    // Screen dx = 10 → font dx scaled by NUDGE_SCALE.
    expect(ev.dx).toBeCloseTo(10 * NUDGE_SCALE);
  });

  test('toggling ctrl+alt mid-drag smoothly changes the sensitivity without jump', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const emitLive = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        emitLive,
        viewport,
      }),
    );

    act(() => {
      // Normal regime: mousedown, move 10px → dx=10.
      result.current.input.onMouseDown(mouseEvent(400, 300));
      result.current.input.onMouseMove(mouseEvent(410, 300));
      // Enable nudge mid-drag, move another 10px → rebased origin, +1px dx.
      result.current.input.onMouseMove(mouseEvent(420, 300, { ctrl: true, alt: true }));
    });
    const last = emitLive.mock.calls.at(-1)?.[0] as LiveEditEvent;
    // Expected total dx: 10 (normal) + 10 * NUDGE_SCALE = 11.
    expect(last.dx).toBeCloseTo(10 + 10 * NUDGE_SCALE);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * Alt-click line segment & add-point tool
 * ────────────────────────────────────────────────────────────────────── */

describe('useCanvasInput — segment actions', () => {
  test('alt-click on a line segment (select tool) invokes onConvertLineSegment', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onConvertLineSegment = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        onConvertLineSegment,
        viewport,
      }),
    );

    // Midpoint of bottom edge p1 (0,0) → p2 (100,0) in font space = (50, 0).
    // Screen: (400+50, 300) = (450, 300).
    act(() => result.current.input.onMouseDown(mouseEvent(450, 300, { alt: true })));
    expect(onConvertLineSegment).toHaveBeenCalledTimes(1);
    const [contourId, toAnchorId] = onConvertLineSegment.mock.calls[0] ?? [];
    expect(contourId).toBe('C1');
    // Segment 0 is p1 → p2; the "to" anchor is p2.
    expect(toAnchorId).toBe('p2');
  });

  test('alt-click on a line segment (add-point tool) inserts instead of converts', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onInsertAnchorOnSegment = vi.fn();
    const onConvertLineSegment = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'add-point',
        onInsertAnchorOnSegment,
        onConvertLineSegment,
        viewport,
      }),
    );

    act(() => result.current.input.onMouseDown(mouseEvent(450, 300, { alt: true })));
    expect(onInsertAnchorOnSegment).toHaveBeenCalledTimes(1);
    expect(onConvertLineSegment).not.toHaveBeenCalled();
    const [contourId, segIdx, t] = onInsertAnchorOnSegment.mock.calls[0] ?? [];
    expect(contourId).toBe('C1');
    expect(segIdx).toBe(0);
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.6);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * Escape cancels
 * ────────────────────────────────────────────────────────────────────── */

describe('useCanvasInput — escape cancels', () => {
  test('Escape during drag returns to idle without commit', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onCommitMove = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        onCommitMove,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 300));
      result.current.input.onMouseMove(mouseEvent(420, 300));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.input.dragRef.current.kind).toBe('idle');
    expect(onCommitMove).not.toHaveBeenCalled();
  });

  test('Escape during marquee returns to idle without selection change', () => {
    const glyph = makeTriangle();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onSelectionChange = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: EMPTY_SELECTION,
        tool: 'select',
        onSelectionChange,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(10, 10));
      result.current.input.onMouseMove(mouseEvent(500, 500));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.input.dragRef.current.kind).toBe('idle');
    // Escape skips the mouseup handler entirely, so no commit-level selection change fires.
    const changedBySelect = onSelectionChange.mock.calls.some(
      (c) => (c[0] as Selection).anchors.size > 0,
    );
    expect(changedBySelect).toBe(false);
  });
});
