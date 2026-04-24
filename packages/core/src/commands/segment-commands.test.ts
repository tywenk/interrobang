import { describe, expect, test } from 'vitest';

import type { Font, Point } from '../index.js';
import { emptyFont } from '../ops/glyph-ops.js';
import {
  convertLineSegmentToCurveCommand,
  insertAnchorOnSegmentCommand,
} from './segment-commands.js';

const pt = (id: string, x: number, y: number, type: Point['type'] = 'line'): Point => ({
  id,
  x,
  y,
  type,
  smooth: false,
});

function fontWithContour(points: readonly Point[], closed = true): Font {
  const f = emptyFont('Test');
  const master = f.masters[0]!;
  const contour = { id: 'C1', closed, points };
  const layer = {
    id: 'L1',
    masterId: master.id,
    contours: [contour],
    components: [],
    anchors: [],
  };
  const glyph = {
    id: 'G1',
    name: 'A',
    advanceWidth: 500,
    unicodeCodepoint: null,
    revision: 0,
    layers: [layer],
  };
  return {
    ...f,
    glyphs: { G1: glyph },
    glyphOrder: ['G1'],
  };
}

function getContour(f: Font) {
  return f.glyphs['G1']!.layers[0]!.contours[0]!;
}

describe('convertLineSegmentToCurveCommand', () => {
  test('converts line segment to cubic with offcurves at 1/3 and 2/3', () => {
    const font = fontWithContour([pt('a', 0, 0), pt('b', 300, 0)], false);
    const cmd = convertLineSegmentToCurveCommand({
      glyphId: 'G1',
      layerId: 'L1',
      contourId: 'C1',
      toAnchorId: 'b',
    });
    const after = cmd.apply(font);
    const c = getContour(after);
    expect(c.points).toHaveLength(4);
    expect(c.points[0]!.id).toBe('a');
    expect(c.points[1]!.type).toBe('offcurve');
    expect(c.points[1]!.x).toBeCloseTo(100);
    expect(c.points[2]!.type).toBe('offcurve');
    expect(c.points[2]!.x).toBeCloseTo(200);
    expect(c.points[3]!.id).toBe('b');
    expect(c.points[3]!.type).toBe('curve');
  });

  test('revert restores the original line segment', () => {
    const font = fontWithContour([pt('a', 0, 0), pt('b', 300, 0)], false);
    const cmd = convertLineSegmentToCurveCommand({
      glyphId: 'G1',
      layerId: 'L1',
      contourId: 'C1',
      toAnchorId: 'b',
    });
    const after = cmd.apply(font);
    const back = cmd.revert(after);
    const c = getContour(back);
    expect(c.points).toHaveLength(2);
    expect(c.points[0]!.id).toBe('a');
    expect(c.points[1]!.id).toBe('b');
    expect(c.points[1]!.type).toBe('line');
  });

  test('no-op when the target anchor is not part of a line segment', () => {
    const font = fontWithContour(
      [
        pt('a', 0, 0, 'line'),
        pt('h1', 0, 100, 'offcurve'),
        pt('h2', 100, 100, 'offcurve'),
        pt('b', 100, 0, 'curve'),
      ],
      false,
    );
    const cmd = convertLineSegmentToCurveCommand({
      glyphId: 'G1',
      layerId: 'L1',
      contourId: 'C1',
      toAnchorId: 'b', // already curve
    });
    const after = cmd.apply(font);
    expect(getContour(after).points).toHaveLength(4);
    expect(getContour(after).points[3]!.type).toBe('curve');
  });
});

describe('insertAnchorOnSegmentCommand — line', () => {
  test('inserts anchor at midpoint of a line segment (t=0.5)', () => {
    const font = fontWithContour([pt('a', 0, 0), pt('b', 100, 0)], false);
    const cmd = insertAnchorOnSegmentCommand({
      glyphId: 'G1',
      layerId: 'L1',
      contourId: 'C1',
      segmentIndex: 0,
      t: 0.5,
    });
    const after = cmd.apply(font);
    const c = getContour(after);
    expect(c.points).toHaveLength(3);
    expect(c.points[1]!.type).toBe('line');
    expect(c.points[1]!.x).toBeCloseTo(50);
    expect(c.points[1]!.y).toBeCloseTo(0);
  });

  test('revert removes the inserted anchor and restores original', () => {
    const font = fontWithContour([pt('a', 0, 0), pt('b', 100, 0)], false);
    const cmd = insertAnchorOnSegmentCommand({
      glyphId: 'G1',
      layerId: 'L1',
      contourId: 'C1',
      segmentIndex: 0,
      t: 0.5,
    });
    const after = cmd.apply(font);
    const back = cmd.revert(after);
    const c = getContour(back);
    expect(c.points).toHaveLength(2);
    expect(c.points.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('insertAnchorOnSegmentCommand — cubic', () => {
  test('splits a cubic segment into two cubics (7 points total)', () => {
    // Symmetric cubic: at t=0.5, new anchor should be at (50, 75).
    const font = fontWithContour(
      [
        pt('a', 0, 0, 'line'),
        pt('h1', 0, 100, 'offcurve'),
        pt('h2', 100, 100, 'offcurve'),
        pt('b', 100, 0, 'curve'),
      ],
      false,
    );
    const cmd = insertAnchorOnSegmentCommand({
      glyphId: 'G1',
      layerId: 'L1',
      contourId: 'C1',
      segmentIndex: 0,
      t: 0.5,
    });
    const after = cmd.apply(font);
    const c = getContour(after);
    expect(c.points).toHaveLength(7);
    expect(c.points[0]!.id).toBe('a');
    expect(c.points[0]!.type).toBe('line');
    expect(c.points[1]!.type).toBe('offcurve');
    expect(c.points[2]!.type).toBe('offcurve');
    expect(c.points[3]!.type).toBe('curve');
    expect(c.points[3]!.x).toBeCloseTo(50);
    expect(c.points[3]!.y).toBeCloseTo(75);
    expect(c.points[4]!.type).toBe('offcurve');
    expect(c.points[5]!.type).toBe('offcurve');
    expect(c.points[6]!.id).toBe('b');
    expect(c.points[6]!.type).toBe('curve');
  });

  test('revert on cubic split restores original 4 points', () => {
    const font = fontWithContour(
      [
        pt('a', 0, 0, 'line'),
        pt('h1', 0, 100, 'offcurve'),
        pt('h2', 100, 100, 'offcurve'),
        pt('b', 100, 0, 'curve'),
      ],
      false,
    );
    const cmd = insertAnchorOnSegmentCommand({
      glyphId: 'G1',
      layerId: 'L1',
      contourId: 'C1',
      segmentIndex: 0,
      t: 0.42,
    });
    const after = cmd.apply(font);
    const back = cmd.revert(after);
    const c = getContour(back);
    expect(c.points).toHaveLength(4);
    expect(c.points.map((p) => p.id)).toEqual(['a', 'h1', 'h2', 'b']);
    expect(c.points.map((p) => p.type)).toEqual(['line', 'offcurve', 'offcurve', 'curve']);
  });
});

describe('insertAnchorOnSegmentCommand — qcurve', () => {
  test('splits a quadratic into two qcurves (5 points total)', () => {
    const font = fontWithContour(
      [pt('a', 0, 0, 'line'), pt('h', 50, 100, 'offcurve'), pt('b', 100, 0, 'qcurve')],
      false,
    );
    const cmd = insertAnchorOnSegmentCommand({
      glyphId: 'G1',
      layerId: 'L1',
      contourId: 'C1',
      segmentIndex: 0,
      t: 0.5,
    });
    const after = cmd.apply(font);
    const c = getContour(after);
    expect(c.points).toHaveLength(5);
    expect(c.points[0]!.id).toBe('a');
    expect(c.points[2]!.type).toBe('qcurve');
    expect(c.points[4]!.id).toBe('b');
  });

  test('revert on qcurve split restores original 3 points', () => {
    const font = fontWithContour(
      [pt('a', 0, 0, 'line'), pt('h', 50, 100, 'offcurve'), pt('b', 100, 0, 'qcurve')],
      false,
    );
    const cmd = insertAnchorOnSegmentCommand({
      glyphId: 'G1',
      layerId: 'L1',
      contourId: 'C1',
      segmentIndex: 0,
      t: 0.5,
    });
    const after = cmd.apply(font);
    const back = cmd.revert(after);
    const c = getContour(back);
    expect(c.points.map((p) => p.id)).toEqual(['a', 'h', 'b']);
  });
});
