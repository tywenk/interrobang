import { test, expect, vi } from 'vitest';
import type { Layer } from '@interrobang/core';
import { Viewport } from './viewport.js';
import { drawLayer } from './render.js';

function fakeCtx() {
  const calls: string[] = [];
  const ctx = {
    beginPath: vi.fn(() => calls.push('beginPath')),
    moveTo: vi.fn((x: number, y: number) => calls.push(`moveTo(${x},${y})`)),
    lineTo: vi.fn((x: number, y: number) => calls.push(`lineTo(${x},${y})`)),
    closePath: vi.fn(() => calls.push('closePath')),
    stroke: vi.fn(() => calls.push('stroke')),
    fill: vi.fn(() => calls.push('fill')),
    arc: vi.fn(() => calls.push('arc')),
    quadraticCurveTo: vi.fn(() => calls.push('quadraticCurveTo')),
    bezierCurveTo: vi.fn(() => calls.push('bezierCurveTo')),
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
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

test('drawLayer issues moveTo + lineTo for a triangle contour', () => {
  const layer: Layer = {
    id: 'l1',
    masterId: 'm1',
    anchors: [],
    components: [],
    contours: [
      {
        id: 'c1',
        closed: true,
        points: [
          { id: 'p1', x: 0, y: 0, type: 'line', smooth: false },
          { id: 'p2', x: 100, y: 0, type: 'line', smooth: false },
          { id: 'p3', x: 50, y: 100, type: 'line', smooth: false },
        ],
      },
    ],
  };
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const { ctx, calls } = fakeCtx();
  drawLayer(ctx, layer, vp, new Set());
  expect(calls.some((c) => c.startsWith('moveTo'))).toBe(true);
  expect(calls.filter((c) => c.startsWith('lineTo')).length).toBeGreaterThanOrEqual(2);
  expect(calls).toContain('closePath');
  expect(calls).toContain('stroke');
});
