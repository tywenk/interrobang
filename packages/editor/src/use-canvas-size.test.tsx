import type { Glyph } from '@interrobang/core';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

import { useCanvasSize } from './use-canvas-size.js';

type ROCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;

class MockResizeObserver {
  static lastCallback: ROCallback | null = null;
  constructor(cb: ROCallback) {
    MockResizeObserver.lastCallback = cb;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function makeGlyph(id: string): Glyph {
  return {
    id,
    name: id,
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
              { id: 'p4', x: 0, y: 100, type: 'line', smooth: false },
            ],
          },
        ],
      },
    ],
  };
}

// Minimal 2D-context stub so scheduleDraw's rAF callback has something to call.
function installCanvasCtxStub(): void {
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: () => unknown };
  proto.getContext = () => ({
    setTransform: () => {},
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    bezierCurveTo: () => {},
    closePath: () => {},
    stroke: () => {},
    arc: () => {},
    fill: () => {},
  });
}

function useHarness(glyph: Glyph, draw: (ctx: CanvasRenderingContext2D) => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!containerRef.current) {
    const div = document.createElement('div');
    // happy-dom doesn't give an initial bounding rect; stub it so applySize
    // receives deterministic numbers.
    div.getBoundingClientRect = () =>
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
    containerRef.current = div;
  }
  if (!canvasRef.current) {
    canvasRef.current = document.createElement('canvas');
  }
  return useCanvasSize({ containerRef, canvasRef, glyph, draw });
}

describe('useCanvasSize', () => {
  beforeEach(() => {
    installCanvasCtxStub();
    MockResizeObserver.lastCallback = null;
    (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
      MockResizeObserver;
    // Mirror real rAF ordering: the frame id is returned before the callback
    // runs, so scheduleDraw's rafRef is cleared inside the callback only after
    // it was first set to a non-null id. queueMicrotask keeps flushes
    // observable in tests via `await Promise.resolve()`.
    (
      globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }
    ).requestAnimationFrame = (cb) => {
      queueMicrotask(() => cb(0));
      return 1;
    };
    (globalThis as unknown as { devicePixelRatio: number }).devicePixelRatio = 1;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns a viewport sized to match ResizeObserver callbacks', () => {
    const glyph = makeGlyph('A');
    const { result } = renderHook(() => useHarness(glyph, () => {}));
    expect(result.current.viewport.getCanvasSize()).toEqual({ width: 800, height: 600 });

    act(() => {
      MockResizeObserver.lastCallback?.([{ contentRect: { width: 1200, height: 900 } }]);
    });

    expect(result.current.viewport.getCanvasSize()).toEqual({ width: 1200, height: 900 });
  });

  test('rerendering with a new glyph schedules a redraw', async () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    const glyph = makeGlyph('A');
    const { rerender } = renderHook(({ g }: { g: Glyph }) => useHarness(g, () => {}), {
      initialProps: { g: glyph },
    });
    // Let the initial mount's rAF drain so rafRef clears before we rerender.
    await act(async () => {
      await Promise.resolve();
    });
    rafSpy.mockClear();

    const nextGlyph = makeGlyph('B');
    rerender({ g: nextGlyph });

    expect(rafSpy).toHaveBeenCalled();
  });

  test('fitToGlyph uses the latest glyph', () => {
    const glyph = makeGlyph('A');
    const { result, rerender } = renderHook(({ g }: { g: Glyph }) => useHarness(g, () => {}), {
      initialProps: { g: glyph },
    });
    const vp = result.current.viewport;
    const fitSpy = vi.spyOn(vp, 'fitToGlyph');

    const nextGlyph = makeGlyph('B');
    rerender({ g: nextGlyph });

    act(() => {
      result.current.fitToGlyph();
    });

    expect(fitSpy).toHaveBeenCalled();
    const lastArg = fitSpy.mock.calls.at(-1)?.[0];
    expect(lastArg?.id).toBe('B');
  });
});
