import type { Layer, Point } from '@interrobang/core';
import { describe, expect, test } from 'vitest';

import { hitTest } from './hit-test.js';
import { Viewport } from './viewport.js';

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
      points: [pt('p1', 0, 0), pt('p2', 100, 0), pt('p3', 100, 100)],
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

describe('hitTest — anchors', () => {
  test('hit on an anchor returns anchor result with pointIndex', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const screen = vp.fontToScreen(100, 0);
    const hit = hitTest(triangleLayer, vp, screen.x, screen.y, { pointTolerancePx: 8 });
    expect(hit).toEqual({
      kind: 'anchor',
      pointId: 'p2',
      contourId: 'c1',
      pointIndex: 1,
    });
  });

  test('miss returns null when far from everything', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    expect(
      hitTest(triangleLayer, vp, 0, 0, { pointTolerancePx: 4, segmentTolerancePx: 0 }),
    ).toBeNull();
  });

  test('within tolerance counts as hit', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const screen = vp.fontToScreen(100, 0);
    const hit = hitTest(triangleLayer, vp, screen.x + 5, screen.y - 5, { pointTolerancePx: 8 });
    expect(hit).not.toBeNull();
    expect(hit!.kind).toBe('anchor');
  });

  test('legacy signature — bare tolerance number still works', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const screen = vp.fontToScreen(100, 0);
    const hit = hitTest(triangleLayer, vp, screen.x, screen.y, 8);
    expect(hit?.kind).toBe('anchor');
  });
});

describe('hitTest — handles', () => {
  test('handle NOT hittable when its parent anchor is not selected', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const h1Screen = vp.fontToScreen(0, 100);
    const hit = hitTest(cubicLayer, vp, h1Screen.x, h1Screen.y, {
      pointTolerancePx: 8,
      segmentTolerancePx: 0,
    });
    // No selected anchors → handle is not hittable.
    expect(hit).toBeNull();
  });

  test('handle hittable when parent anchor IS selected', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const h1Screen = vp.fontToScreen(0, 100); // h1 attaches to anchor 'a' (idx 0).
    const hit = hitTest(cubicLayer, vp, h1Screen.x, h1Screen.y, {
      pointTolerancePx: 8,
      selectedAnchors: new Set(['a']),
    });
    expect(hit).toMatchObject({
      kind: 'handle',
      pointId: 'h1',
      anchorId: 'a',
      contourId: 'c1',
    });
  });

  test('selecting a different anchor does not expose a handle belonging to another', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const h1Screen = vp.fontToScreen(0, 100);
    const hit = hitTest(cubicLayer, vp, h1Screen.x, h1Screen.y, {
      pointTolerancePx: 8,
      selectedAnchors: new Set(['b']), // far side; its `in` handle is h2
    });
    // 'b'.in = h2 (idx 2) → h1 (idx 1) is NOT in its handle set.
    expect(hit?.kind).not.toBe('handle');
  });

  test('anchor hit still wins over handle when they overlap', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const anchorScreen = vp.fontToScreen(0, 0); // exact position of anchor 'a'
    const hit = hitTest(cubicLayer, vp, anchorScreen.x, anchorScreen.y, {
      pointTolerancePx: 8,
      selectedAnchors: new Set(['a']),
    });
    expect(hit?.kind).toBe('anchor');
    if (hit?.kind === 'anchor') expect(hit.pointId).toBe('a');
  });
});

describe('hitTest — segments', () => {
  test('segment hit on a line side of the triangle returns {kind:"segment"} with t in (0,1)', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    // Midpoint of the bottom edge (p1→p2) in font space.
    const mid = vp.fontToScreen(50, 0);
    const hit = hitTest(triangleLayer, vp, mid.x, mid.y, {
      pointTolerancePx: 2,
      segmentTolerancePx: 5,
    });
    expect(hit?.kind).toBe('segment');
    if (hit?.kind === 'segment') {
      expect(hit.contourId).toBe('c1');
      expect(hit.t).toBeGreaterThan(0);
      expect(hit.t).toBeLessThan(1);
    }
  });

  test('closed contour: wrap segment from last anchor back to first is hittable', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    // The wrap goes from p3 (100,100) to p1 (0,0). Midpoint at (50,50) in font space.
    const mid = vp.fontToScreen(50, 50);
    const hit = hitTest(triangleLayer, vp, mid.x, mid.y, {
      pointTolerancePx: 2,
      segmentTolerancePx: 5,
    });
    expect(hit?.kind).toBe('segment');
  });

  test('cubic segment midpoint is hittable as a segment', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    // At t=0.5 of the symmetric cubic (above), we calculated S = (50, 75).
    const mid = vp.fontToScreen(50, 75);
    const hit = hitTest(cubicLayer, vp, mid.x, mid.y, {
      pointTolerancePx: 2,
      segmentTolerancePx: 5,
    });
    expect(hit?.kind).toBe('segment');
    if (hit?.kind === 'segment') {
      expect(hit.t).toBeGreaterThan(0.3);
      expect(hit.t).toBeLessThan(0.7);
    }
  });

  test('segment priority: anchors beat segments when overlapping', () => {
    const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
    const anchorScreen = vp.fontToScreen(0, 0);
    const hit = hitTest(triangleLayer, vp, anchorScreen.x, anchorScreen.y, {
      pointTolerancePx: 8,
      segmentTolerancePx: 8,
    });
    expect(hit?.kind).toBe('anchor');
  });
});
