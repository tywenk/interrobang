import type { Layer, Point } from '@interrobang/core';
import { describe, expect, test, vi } from 'vitest';

import { drawLayer } from './render.js';
import { makeSelection } from './selection.js';
import { Viewport } from './viewport.js';

interface FakeCtx {
  ctx: CanvasRenderingContext2D;
  calls: string[];
}

function fakeCtx(): FakeCtx {
  const calls: string[] = [];
  const ctx = {
    beginPath: vi.fn(() => calls.push('beginPath')),
    moveTo: vi.fn((x: number, y: number) => calls.push(`moveTo(${x},${y})`)),
    lineTo: vi.fn((x: number, y: number) => calls.push(`lineTo(${x},${y})`)),
    closePath: vi.fn(() => calls.push('closePath')),
    stroke: vi.fn(() => calls.push('stroke')),
    fill: vi.fn(() => calls.push('fill')),
    arc: vi.fn(() => calls.push('arc')),
    rect: vi.fn((x: number, y: number, w: number, h: number) =>
      calls.push(`rect(${x},${y},${w},${h})`),
    ),
    strokeRect: vi.fn(() => calls.push('strokeRect')),
    quadraticCurveTo: vi.fn(() => calls.push('quadraticCurveTo')),
    bezierCurveTo: vi.fn(() => calls.push('bezierCurveTo')),
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
    setLineDash: vi.fn(() => calls.push('setLineDash')),
    set strokeStyle(_: string) {
      /* noop */
    },
    set fillStyle(_: string) {
      /* noop */
    },
    set lineWidth(_: number) {
      /* noop */
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const pt = (id: string, x: number, y: number, type: Point['type'] = 'line'): Point => ({
  id,
  x,
  y,
  type,
  smooth: false,
});

const triangleLayer: Layer = {
  id: 'l1',
  masterId: 'm1',
  anchors: [],
  components: [],
  contours: [
    {
      id: 'c1',
      closed: true,
      points: [pt('p1', 0, 0), pt('p2', 100, 0), pt('p3', 50, 100)],
    },
  ],
};

const cubicLayer: Layer = {
  id: 'l1',
  masterId: 'm1',
  anchors: [],
  components: [],
  contours: [
    {
      id: 'c1',
      closed: false,
      points: [
        pt('a', 0, 0, 'line'),
        pt('h1', 0, 100, 'offcurve'),
        pt('h2', 100, 100, 'offcurve'),
        pt('b', 100, 0, 'curve'),
      ],
    },
  ],
};

describe('drawLayer', () => {
  test('issues moveTo + lineTo for a triangle contour (back-compat with legacy set signature)', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const { ctx, calls } = fakeCtx();
    drawLayer(ctx, triangleLayer, vp, new Set());
    expect(calls.some((c) => c.startsWith('moveTo'))).toBe(true);
    expect(calls.filter((c) => c.startsWith('lineTo')).length).toBeGreaterThanOrEqual(2);
    expect(calls).toContain('closePath');
    expect(calls).toContain('stroke');
  });

  test('handles are NOT drawn when no anchor is selected', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const { ctx, calls } = fakeCtx();
    drawLayer(ctx, cubicLayer, vp, { selection: makeSelection() });
    expect(calls.filter((c) => c.startsWith('rect('))).toHaveLength(0);
  });

  test('handles ARE drawn when their parent anchor is selected', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const { ctx, calls } = fakeCtx();
    // Anchor 'a' is at idx 0; its outgoing handle is 'h1' (idx 1).
    drawLayer(ctx, cubicLayer, vp, { selection: makeSelection(['a']) });
    // One rect for h1 (outgoing from 'a').
    const rects = calls.filter((c) => c.startsWith('rect('));
    expect(rects.length).toBe(1);
    // Handle line drawn (anchor->handle): count moveTo targeting anchor 'a' screen coord.
    const aScreen = vp.fontToScreen(0, 0);
    expect(calls).toContain(`moveTo(${aScreen.x},${aScreen.y})`);
  });

  test('selected handle renders filled (fill called after rect)', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const { ctx, calls } = fakeCtx();
    drawLayer(ctx, cubicLayer, vp, {
      selection: makeSelection(['a'], ['h1']),
    });
    const rectCalls = calls.filter((c) => c.startsWith('rect('));
    expect(rectCalls.length).toBe(1);
    // After the rect, a fill (not just a stroke) should occur for the selected handle.
    const rectIdx = calls.findIndex((c) => c.startsWith('rect('));
    expect(calls.slice(rectIdx + 1, rectIdx + 3)).toContain('fill');
  });

  test('marquee overlay draws a strokeRect', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const { ctx, calls } = fakeCtx();
    drawLayer(ctx, triangleLayer, vp, {
      marquee: { sx0: 10, sy0: 20, sx1: 100, sy1: 80 },
    });
    expect(calls).toContain('strokeRect');
    expect(calls).toContain('setLineDash');
  });

  test('anchors always render as arcs (one per non-offcurve point)', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const { ctx, calls } = fakeCtx();
    drawLayer(ctx, cubicLayer, vp, { selection: makeSelection(['a']) });
    // 2 anchors in cubicLayer (a, b); 2 arcs.
    const arcs = calls.filter((c) => c === 'arc');
    expect(arcs.length).toBe(2);
  });
});
