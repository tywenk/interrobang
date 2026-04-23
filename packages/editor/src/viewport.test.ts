import { test, expect } from 'vitest';

import { Viewport } from './viewport.js';

test('default viewport maps font origin to canvas centre', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const { x, y } = vp.fontToScreen(0, 0);
  expect(x).toBe(400);
  expect(y).toBe(300);
});

test('Y axis flips (font Y up, screen Y down)', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const a = vp.fontToScreen(0, 0);
  const b = vp.fontToScreen(0, 100);
  expect(b.y).toBeLessThan(a.y);
});

test('zoom about a pivot keeps the pivot stable', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const before = vp.fontToScreen(50, 50);
  vp.zoomAbout(2, before.x, before.y);
  const after = vp.fontToScreen(50, 50);
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
});

test('panBy translates everything', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  vp.panBy(10, -20);
  const { x, y } = vp.fontToScreen(0, 0);
  expect(x).toBe(410);
  expect(y).toBe(280);
});

test('screenToFont inverts fontToScreen', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  vp.zoomAbout(1.5, 200, 200);
  vp.panBy(13, -7);
  const screen = vp.fontToScreen(123, 456);
  const back = vp.screenToFont(screen.x, screen.y);
  expect(back.x).toBeCloseTo(123);
  expect(back.y).toBeCloseTo(456);
});
