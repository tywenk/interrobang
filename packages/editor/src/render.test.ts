import { test, expect, mock } from 'bun:test';
import type { Layer } from '@interrobang/core';
import { Viewport } from './viewport.js';
import { drawLayer } from './render.js';

function fakeCtx() {
  const calls: string[] = [];
  const ctx = {
    beginPath: mock(() => calls.push('beginPath')),
    moveTo: mock((x: number, y: number) => calls.push(`moveTo(${x},${y})`)),
    lineTo: mock((x: number, y: number) => calls.push(`lineTo(${x},${y})`)),
    closePath: mock(() => calls.push('closePath')),
    stroke: mock(() => calls.push('stroke')),
    fill: mock(() => calls.push('fill')),
    arc: mock(() => calls.push('arc')),
    quadraticCurveTo: mock(() => calls.push('quadraticCurveTo')),
    bezierCurveTo: mock(() => calls.push('bezierCurveTo')),
    save: mock(() => calls.push('save')),
    restore: mock(() => calls.push('restore')),
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
