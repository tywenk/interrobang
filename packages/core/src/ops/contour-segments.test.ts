import { describe, expect, test } from 'vitest';

import type { Contour, Point } from '../contour.js';
import {
  adjacentOffcurves,
  cubicAt,
  flattenSegment,
  quadraticAt,
  segmentsOf,
  splitCubicAt,
  splitQuadraticAt,
} from './contour-segments.js';

const mkPoint = (id: string, x: number, y: number, type: Point['type'] = 'line'): Point => ({
  id,
  x,
  y,
  type,
  smooth: false,
});

const mkContour = (pts: readonly Point[], closed = true): Contour => ({
  id: 'c',
  closed,
  points: pts,
});

describe('segmentsOf', () => {
  test('empty contour yields no segments', () => {
    expect(segmentsOf(mkContour([]))).toEqual([]);
  });

  test('single anchor (no segments) in an open contour', () => {
    expect(segmentsOf(mkContour([mkPoint('a', 0, 0)], false))).toEqual([]);
  });

  test('closed triangle of line segments yields 3 wrap segments', () => {
    const c = mkContour([mkPoint('a', 0, 0), mkPoint('b', 100, 0), mkPoint('c', 50, 100)]);
    const segs = segmentsOf(c);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ kind: 'line', fromIdx: 0, toIdx: 1 });
    expect(segs[1]).toEqual({ kind: 'line', fromIdx: 1, toIdx: 2 });
    expect(segs[2]).toEqual({ kind: 'line', fromIdx: 2, toIdx: 0 });
  });

  test('open contour: no wrap segment from last anchor to first', () => {
    const c = mkContour([mkPoint('a', 0, 0), mkPoint('b', 100, 0), mkPoint('c', 50, 100)], false);
    expect(segmentsOf(c)).toHaveLength(2);
  });

  test('cubic segment: two offcurves between anchors, closing anchor is curve', () => {
    const c = mkContour([
      mkPoint('a', 0, 0, 'line'),
      mkPoint('h1', 30, 80, 'offcurve'),
      mkPoint('h2', 70, 80, 'offcurve'),
      mkPoint('b', 100, 0, 'curve'),
    ]);
    const segs = segmentsOf(c);
    // Forward first, then wrap.
    expect(segs[0]).toEqual({ kind: 'cubic', fromIdx: 0, hAIdx: 1, hBIdx: 2, toIdx: 3 });
    expect(segs[1]).toEqual({ kind: 'line', fromIdx: 3, toIdx: 0 });
  });

  test('qcurve segment: one offcurve, closing anchor is qcurve', () => {
    const c = mkContour(
      [
        mkPoint('a', 0, 0, 'line'),
        mkPoint('h', 50, 100, 'offcurve'),
        mkPoint('b', 100, 0, 'qcurve'),
      ],
      false,
    );
    const segs = segmentsOf(c);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ kind: 'qcurve', fromIdx: 0, hIdx: 1, toIdx: 2 });
  });

  test('leading offcurves (closed contour) become handles on the wrap segment', () => {
    // Layout: [hA_wrap, hB_wrap, A(curve), H1, H2, B(curve)]
    // Wrap segment: B -> A is cubic because A's type is 'curve'.
    const c = mkContour([
      mkPoint('hWA', 10, 10, 'offcurve'),
      mkPoint('hWB', 20, 20, 'offcurve'),
      mkPoint('a', 0, 0, 'curve'),
      mkPoint('h1', 30, 80, 'offcurve'),
      mkPoint('h2', 70, 80, 'offcurve'),
      mkPoint('b', 100, 0, 'curve'),
    ]);
    const segs = segmentsOf(c);
    expect(segs[0]).toEqual({ kind: 'cubic', fromIdx: 2, hAIdx: 3, hBIdx: 4, toIdx: 5 });
    expect(segs[1]).toEqual({ kind: 'cubic', fromIdx: 5, hAIdx: 0, hBIdx: 1, toIdx: 2 });
  });

  test('malformed segment (line closing with handle buffer) is skipped', () => {
    const c = mkContour([
      mkPoint('a', 0, 0, 'line'),
      mkPoint('hOrphan', 50, 50, 'offcurve'),
      mkPoint('b', 100, 0, 'line'), // "line" closing but there's a stray handle
    ]);
    const segs = segmentsOf(c);
    // The a→b segment is dropped because the line type can't consume the handle.
    // Only the wrap b→a remains.
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ kind: 'line', fromIdx: 2, toIdx: 0 });
  });
});

describe('adjacentOffcurves', () => {
  test('open contour: first anchor has no `in`, last anchor has no `out`', () => {
    const c = mkContour(
      [
        mkPoint('a', 0, 0, 'line'),
        mkPoint('h1', 10, 10, 'offcurve'),
        mkPoint('h2', 20, 20, 'offcurve'),
        mkPoint('b', 100, 0, 'curve'),
      ],
      false,
    );
    expect(adjacentOffcurves(c, 0)).toEqual({ out: 1 });
    expect(adjacentOffcurves(c, 3)).toEqual({ in: 2 });
  });

  test('closed contour: boundary anchors wrap around', () => {
    const c = mkContour([
      mkPoint('a', 0, 0, 'line'),
      mkPoint('b', 100, 0, 'line'),
      mkPoint('hLast', 110, 50, 'offcurve'),
    ]);
    // last point is offcurve and contour is closed → anchor 0's `in` wraps to n-1
    expect(adjacentOffcurves(c, 0).in).toBe(2);
  });

  test('anchor index out of range returns empty', () => {
    const c = mkContour([mkPoint('a', 0, 0, 'line')]);
    expect(adjacentOffcurves(c, 99)).toEqual({});
  });

  test('offcurve index returns empty (not an anchor)', () => {
    const c = mkContour([
      mkPoint('a', 0, 0, 'line'),
      mkPoint('h', 50, 50, 'offcurve'),
      mkPoint('b', 100, 0, 'curve'),
    ]);
    expect(adjacentOffcurves(c, 1)).toEqual({});
  });

  test('anchor with no adjacent offcurves on either side', () => {
    const c = mkContour([
      mkPoint('a', 0, 0, 'line'),
      mkPoint('b', 100, 0, 'line'),
      mkPoint('c', 50, 100, 'line'),
    ]);
    expect(adjacentOffcurves(c, 1)).toEqual({});
  });
});

describe('splitCubicAt', () => {
  test('at t=0.5, midpoint of a symmetric curve', () => {
    // Symmetric S-curve around x=50
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };
    const { S } = splitCubicAt(p0, p1, p2, p3, 0.5);
    // By symmetry, midpoint X is exactly 50.
    expect(S.x).toBeCloseTo(50);
    // Y: (0.125*0 + 0.375*100 + 0.375*100 + 0.125*0) = 75
    expect(S.y).toBeCloseTo(75);
  });

  test('cubicAt agrees with splitCubicAt.S at multiple t', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 50 };
    const p2 = { x: 90, y: 50 };
    const p3 = { x: 100, y: 0 };
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const direct = cubicAt(p0, p1, p2, p3, t);
      const { S } = splitCubicAt(p0, p1, p2, p3, t);
      expect(S.x).toBeCloseTo(direct.x);
      expect(S.y).toBeCloseTo(direct.y);
    }
  });

  test('at t=0 the split point is p0 and at t=1 it is p3', () => {
    const p0 = { x: 7, y: 3 };
    const p1 = { x: 10, y: 20 };
    const p2 = { x: 30, y: 20 };
    const p3 = { x: 50, y: 3 };
    const at0 = splitCubicAt(p0, p1, p2, p3, 0);
    const at1 = splitCubicAt(p0, p1, p2, p3, 1);
    expect(at0.S).toEqual(p0);
    expect(at1.S).toEqual(p3);
  });
});

describe('splitQuadraticAt', () => {
  test('at t=0.5, midpoint of a symmetric parabola', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 100 };
    const p2 = { x: 100, y: 0 };
    const { S } = splitQuadraticAt(p0, p1, p2, 0.5);
    expect(S.x).toBeCloseTo(50);
    expect(S.y).toBeCloseTo(50); // Quadratic bezier peak is half the control height
  });

  test('quadraticAt agrees with splitQuadraticAt.S', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 80 };
    const p2 = { x: 100, y: 0 };
    for (const t of [0.2, 0.5, 0.8]) {
      const direct = quadraticAt(p0, p1, p2, t);
      const { S } = splitQuadraticAt(p0, p1, p2, t);
      expect(S.x).toBeCloseTo(direct.x);
      expect(S.y).toBeCloseTo(direct.y);
    }
  });
});

describe('flattenSegment', () => {
  test('line segment yields two samples at t=0 and t=1', () => {
    const c = mkContour([mkPoint('a', 0, 0), mkPoint('b', 100, 0)], false);
    const segs = segmentsOf(c);
    const flat = flattenSegment(segs[0]!, c);
    expect(flat).toHaveLength(2);
    expect(flat[0]).toEqual({ pt: { x: 0, y: 0 }, t: 0 });
    expect(flat[1]).toEqual({ pt: { x: 100, y: 0 }, t: 1 });
  });

  test('cubic segment yields 17 samples and endpoints match anchors', () => {
    const c = mkContour(
      [
        mkPoint('a', 0, 0, 'line'),
        mkPoint('h1', 0, 100, 'offcurve'),
        mkPoint('h2', 100, 100, 'offcurve'),
        mkPoint('b', 100, 0, 'curve'),
      ],
      false,
    );
    const segs = segmentsOf(c);
    const flat = flattenSegment(segs[0]!, c);
    expect(flat).toHaveLength(17);
    expect(flat[0]!.pt).toEqual({ x: 0, y: 0 });
    expect(flat[16]!.pt).toEqual({ x: 100, y: 0 });
  });

  test('qcurve segment also yields 17 samples', () => {
    const c = mkContour(
      [mkPoint('a', 0, 0), mkPoint('h', 50, 100, 'offcurve'), mkPoint('b', 100, 0, 'qcurve')],
      false,
    );
    const segs = segmentsOf(c);
    const flat = flattenSegment(segs[0]!, c);
    expect(flat).toHaveLength(17);
  });
});
