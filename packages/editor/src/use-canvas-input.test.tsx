import type { Glyph } from '@interrobang/core';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { describe, test, expect, vi } from 'vitest';

import type { LiveEditEvent } from './editor-canvas.js';
import { useCanvasInput } from './use-canvas-input.js';
import { Viewport } from './viewport.js';

function makeGlyph(): Glyph {
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

interface HarnessArgs {
  glyph: Glyph;
  selection: ReadonlySet<string>;
  tool: 'select' | 'pen';
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onPenClick?: (fx: number, fy: number) => void;
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
      emitLive: args.emitLive ?? (() => {}),
      scheduleDraw: args.scheduleDraw ?? (() => {}),
    }),
  };
}

// Synthesise a minimal React.MouseEvent<HTMLCanvasElement> sufficient for the
// handler's needs (clientX/clientY). We cast through unknown because we don't
// need the full synthetic-event surface.
function mouseEvent(clientX: number, clientY: number) {
  return { clientX, clientY } as unknown as React.MouseEvent<HTMLCanvasElement>;
}

describe('useCanvasInput', () => {
  test('mouse-down on a point selects it and starts a drag', () => {
    const glyph = makeGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onSelectionChange = vi.fn();
    const scheduleDraw = vi.fn();

    // Viewport default: origin at (400, 300), scale=1, Y flipped.
    // Point p1 at font (0,0) -> screen (400, 300).
    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: new Set(),
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
    const selected = onSelectionChange.mock.calls[0]?.[0] as Set<string>;
    expect([...selected]).toEqual(['p1']);
    expect(result.current.input.dragRef.current.kind).toBe('dragging');
    expect(scheduleDraw).toHaveBeenCalled();
  });

  test('mouse-move during drag emits liveEdit and schedules a draw', () => {
    const glyph = makeGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const emitLive = vi.fn();
    const scheduleDraw = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: new Set(),
        tool: 'select',
        emitLive,
        scheduleDraw,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(400, 300));
    });
    scheduleDraw.mockClear();

    // Move 10 screen px right, 20 px down. Font delta: dx=+10, dy=+20 (flipped).
    act(() => {
      result.current.input.onMouseMove(mouseEvent(410, 320));
    });

    expect(emitLive).toHaveBeenCalledTimes(1);
    const ev = emitLive.mock.calls[0]?.[0] as LiveEditEvent;
    expect(ev.kind).toBe('point-drag');
    expect(ev.pointIds).toEqual(['p1']);
    expect(ev.dx).toBeCloseTo(10);
    expect(ev.dy).toBeCloseTo(-20);
    expect(scheduleDraw).toHaveBeenCalled();
  });

  test('mouse-up commits the final dx/dy and resets drag', () => {
    const glyph = makeGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onCommitMove = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: new Set(),
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

    expect(onCommitMove).toHaveBeenCalledTimes(1);
    const [ids, dx, dy] = onCommitMove.mock.calls[0] ?? [];
    expect(ids).toEqual(['p1']);
    expect(dx).toBeCloseTo(30);
    expect(dy).toBeCloseTo(-30);
    expect(result.current.input.dragRef.current.kind).toBe('idle');
  });

  test('repeat mouse-down on the same selected point does not re-emit onSelectionChange', () => {
    const glyph = makeGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onSelectionChange = vi.fn();

    const { result, rerender } = renderHook(
      (args: { selection: ReadonlySet<string> }) =>
        useHarness({
          glyph,
          selection: args.selection,
          tool: 'select',
          onSelectionChange,
          viewport,
        }),
      { initialProps: { selection: new Set<string>() } },
    );

    act(() => result.current.input.onMouseDown(mouseEvent(400, 300)));
    expect(onSelectionChange).toHaveBeenCalledTimes(1);

    rerender({ selection: new Set(['p1']) });
    act(() => result.current.input.onMouseUp(mouseEvent(400, 300)));
    onSelectionChange.mockClear();

    act(() => result.current.input.onMouseDown(mouseEvent(400, 300)));
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  test('mouse-down outside any point with no prior selection does not emit onSelectionChange', () => {
    const glyph = makeGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onSelectionChange = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: new Set(),
        tool: 'select',
        onSelectionChange,
        viewport,
      }),
    );

    act(() => result.current.input.onMouseDown(mouseEvent(700, 500)));
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  test('pen tool routes mouse-down to onPenClick with font coords', () => {
    const glyph = makeGlyph();
    const viewport = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const onPenClick = vi.fn();
    const onSelectionChange = vi.fn();
    const onCommitMove = vi.fn();

    const { result } = renderHook(() =>
      useHarness({
        glyph,
        selection: new Set(),
        tool: 'pen',
        onPenClick,
        onSelectionChange,
        onCommitMove,
        viewport,
      }),
    );

    act(() => {
      result.current.input.onMouseDown(mouseEvent(500, 200));
    });

    expect(onPenClick).toHaveBeenCalledTimes(1);
    const [fx, fy] = onPenClick.mock.calls[0] ?? [];
    expect(fx).toBeCloseTo(100); // screen 500 - origin 400 at scale 1
    expect(fy).toBeCloseTo(100); // origin 300 - screen 200 (Y flip)
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(result.current.input.dragRef.current.kind).toBe('idle');
  });
});
