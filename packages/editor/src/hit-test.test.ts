import { test, expect } from 'vitest';
import type { Layer } from '@interrobang/core';
import { Viewport } from './viewport.js';
import { hitTest } from './hit-test.js';

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
        { id: 'p3', x: 100, y: 100, type: 'line', smooth: false },
      ],
    },
  ],
};

test('hit on a point returns its id', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const screen = vp.fontToScreen(100, 0);
  const hit = hitTest(layer, vp, screen.x, screen.y, 8);
  expect(hit).toEqual({ kind: 'point', pointId: 'p2', contourId: 'c1' });
});

test('miss returns null', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const hit = hitTest(layer, vp, 0, 0, 4);
  expect(hit).toBeNull();
});

test('within tolerance counts as hit', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const screen = vp.fontToScreen(100, 0);
  const hit = hitTest(layer, vp, screen.x + 5, screen.y - 5, 8);
  expect(hit).not.toBeNull();
});
