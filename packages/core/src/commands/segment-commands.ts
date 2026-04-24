import { nanoid as newId } from 'nanoid';

import type { Contour, Font, Layer, Point } from '../index.js';
import {
  quadraticAt,
  segmentsOf,
  splitCubicAt,
  splitQuadraticAt,
  type Segment,
} from '../ops/contour-segments.js';
import { updateGlyph } from '../ops/glyph-ops.js';
import type { Command } from './command.js';
import type { MutationTarget } from './mutation-target.js';

interface ContourTarget {
  readonly glyphId: string;
  readonly layerId: string;
  readonly contourId: string;
}

function withContour(font: Font, t: ContourTarget, fn: (c: Contour) => Contour): Font {
  return updateGlyph(font, t.glyphId, (g) => {
    const layer = g.layers.find((l) => l.id === t.layerId);
    if (!layer) return g;
    const contour = layer.contours.find((c) => c.id === t.contourId);
    if (!contour) return g;
    const next = fn(contour);
    if (next === contour) return g;
    const layers: readonly Layer[] = g.layers.map((l) =>
      l.id === t.layerId
        ? { ...l, contours: l.contours.map((c) => (c.id === t.contourId ? next : c)) }
        : l,
    );
    return { ...g, layers };
  });
}

export interface ConvertLineSegmentToCurveArgs extends ContourTarget {
  /** Anchor that closes the line segment being converted. */
  readonly toAnchorId: string;
}

/**
 * Convert a `'line'` segment into a cubic `'curve'` segment by inserting two
 * offcurve points at parameters 1/3 and 2/3 along the line and flipping the
 * closing anchor's type. The inserted offcurves are colinear with the line,
 * so the shape is initially visually identical — designers then drag the new
 * handles to shape the curve.
 */
export function convertLineSegmentToCurveCommand(
  args: ConvertLineSegmentToCurveArgs,
): Command<Font> {
  const affects: readonly MutationTarget[] = [
    { kind: 'layer', glyphId: args.glyphId, layerId: args.layerId },
  ];
  // Stable IDs for the inserted offcurves so revert can recognise its own work.
  const insertedH1 = newId();
  const insertedH2 = newId();

  return {
    type: 'convertLineSegmentToCurve',
    affects,
    apply: (font) =>
      withContour(font, args, (c) => {
        const segs = segmentsOf(c);
        const seg = segs.find(
          (s) => s.kind === 'line' && c.points[s.toIdx]!.id === args.toAnchorId,
        );
        if (!seg || seg.kind !== 'line') return c;
        const from = c.points[seg.fromIdx]!;
        const to = c.points[seg.toIdx]!;
        const h1: Point = {
          id: insertedH1,
          x: from.x + (to.x - from.x) * (1 / 3),
          y: from.y + (to.y - from.y) * (1 / 3),
          type: 'offcurve',
          smooth: false,
        };
        const h2: Point = {
          id: insertedH2,
          x: from.x + (to.x - from.x) * (2 / 3),
          y: from.y + (to.y - from.y) * (2 / 3),
          type: 'offcurve',
          smooth: false,
        };
        const nextPoints: Point[] = [];
        for (let i = 0; i < c.points.length; i++) {
          const p = c.points[i]!;
          if (i === seg.toIdx) {
            nextPoints.push(h1, h2, { ...p, type: 'curve' });
          } else {
            nextPoints.push(p);
          }
        }
        return { ...c, points: nextPoints };
      }),
    revert: (font) =>
      withContour(font, args, (c) => {
        // Locate the anchor we converted, then remove the two inserted offcurves
        // immediately preceding it and flip the anchor type back to 'line'.
        const idx = c.points.findIndex((p) => p.id === args.toAnchorId);
        if (idx < 0) return c;
        const before2 = c.points[idx - 2];
        const before1 = c.points[idx - 1];
        if (!before1 || !before2) return c;
        if (before1.id !== insertedH2 || before2.id !== insertedH1) return c;
        const nextPoints = [
          ...c.points.slice(0, idx - 2),
          { ...c.points[idx]!, type: 'line' as const },
          ...c.points.slice(idx + 1),
        ];
        return { ...c, points: nextPoints };
      }),
  };
}

export interface InsertAnchorOnSegmentArgs extends ContourTarget {
  /** Index into `segmentsOf(contour)`. */
  readonly segmentIndex: number;
  /** Parameter along the segment, 0 ≤ t ≤ 1. */
  readonly t: number;
}

/**
 * Insert a new anchor on a segment at parameter `t`.
 *
 *   line  → insert an anchor at lerp(from, to, t); no new offcurves.
 *   cubic → de Casteljau split: 4-point window becomes 7 points with a new
 *           `'curve'` anchor flanked by four updated offcurves.
 *   qcurve → quadratic split: 3-point window becomes 5 points with a new
 *           `'qcurve'` anchor flanked by two updated offcurves.
 *
 * Revert snapshots the original window and restores it byte-for-byte.
 */
export function insertAnchorOnSegmentCommand(args: InsertAnchorOnSegmentArgs): Command<Font> {
  const affects: readonly MutationTarget[] = [
    { kind: 'layer', glyphId: args.glyphId, layerId: args.layerId },
  ];
  // Stable IDs so apply/revert converge on the same contour shape.
  const idSplitAnchor = newId();
  const idNew1 = newId();
  const idNew2 = newId();
  const idNew3 = newId();
  const idNew4 = newId();
  // Snapshot of the pre-apply window for revert.
  let revertFrom: { readonly startIdx: number; readonly window: readonly Point[] } | null = null;

  return {
    type: 'insertAnchorOnSegment',
    affects,
    apply: (font) =>
      withContour(font, args, (c) => {
        const segs = segmentsOf(c);
        const seg = segs[args.segmentIndex];
        if (!seg) return c;
        const window = extractWindow(seg, c);
        const [startIdx, width] = windowRange(seg);
        revertFrom = {
          startIdx,
          window: c.points.slice(startIdx, startIdx + width).map((p) => ({ ...p })),
        };
        const nextWindow = splitSegmentPoints(seg, c, args.t, {
          idSplitAnchor,
          idNew1,
          idNew2,
          idNew3,
          idNew4,
        });
        const head = c.points.slice(0, startIdx);
        const tail = c.points.slice(startIdx + width);
        // Wrap segments (lastAnchor → firstAnchor) don't have a contiguous
        // window in the flat array; fall back to byte-identical no-op.
        if (nextWindow === null || window === null) return c;
        return { ...c, points: [...head, ...nextWindow, ...tail] };
      }),
    revert: (font) =>
      withContour(font, args, (c) => {
        if (!revertFrom) return c;
        const first = revertFrom.window[0]!;
        const last = revertFrom.window[revertFrom.window.length - 1]!;
        const startIdx = c.points.findIndex((p) => p.id === first.id);
        const endIdx = c.points.findIndex((p) => p.id === last.id);
        if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) return c;
        const head = c.points.slice(0, startIdx);
        const tail = c.points.slice(endIdx + 1);
        return { ...c, points: [...head, ...revertFrom.window, ...tail] };
      }),
  };
}

/**
 * The contiguous `[startIdx, width]` slice of a contour's point array that a
 * segment occupies. Returns `null` for wrap segments whose handles are split
 * across the array boundary — we don't support inserting on those in v1.
 */
function windowRange(seg: Segment): [number, number] {
  if (seg.kind === 'line') {
    // A line wrap (seg.toIdx < seg.fromIdx) covers a discontinuous range.
    if (seg.toIdx < seg.fromIdx) return [-1, 0];
    return [seg.fromIdx, seg.toIdx - seg.fromIdx + 1];
  }
  if (seg.kind === 'cubic') {
    if (
      seg.hAIdx !== seg.fromIdx + 1 ||
      seg.hBIdx !== seg.fromIdx + 2 ||
      seg.toIdx !== seg.fromIdx + 3
    )
      return [-1, 0];
    return [seg.fromIdx, 4];
  }
  // qcurve
  if (seg.hIdx !== seg.fromIdx + 1 || seg.toIdx !== seg.fromIdx + 2) return [-1, 0];
  return [seg.fromIdx, 3];
}

function extractWindow(seg: Segment, c: Contour): readonly Point[] | null {
  const [start, width] = windowRange(seg);
  if (start < 0) return null;
  return c.points.slice(start, start + width);
}

interface SplitIds {
  readonly idSplitAnchor: string;
  readonly idNew1: string;
  readonly idNew2: string;
  readonly idNew3: string;
  readonly idNew4: string;
}

function splitSegmentPoints(
  seg: Segment,
  c: Contour,
  t: number,
  ids: SplitIds,
): readonly Point[] | null {
  const [start] = windowRange(seg);
  if (start < 0) return null;
  const tt = Math.max(0, Math.min(1, t));
  const from = c.points[seg.fromIdx]!;
  const to = c.points[seg.toIdx]!;
  if (seg.kind === 'line') {
    const mid: Point = {
      id: ids.idSplitAnchor,
      x: from.x + (to.x - from.x) * tt,
      y: from.y + (to.y - from.y) * tt,
      type: 'line',
      smooth: false,
    };
    // Replace [from, to] with [from, mid, to].
    return [from, mid, to];
  }
  if (seg.kind === 'cubic') {
    const hA = c.points[seg.hAIdx]!;
    const hB = c.points[seg.hBIdx]!;
    const { q0, r0, S, r1, q2 } = splitCubicAt(
      { x: from.x, y: from.y },
      { x: hA.x, y: hA.y },
      { x: hB.x, y: hB.y },
      { x: to.x, y: to.y },
      tt,
    );
    // Replace [from, hA, hB, to] with [from, q0', r0', S(curve), r1', q2', to].
    // The original `from` anchor keeps its type (line or curve); the new anchor is 'curve'.
    return [
      from,
      { id: ids.idNew1, x: q0.x, y: q0.y, type: 'offcurve', smooth: false },
      { id: ids.idNew2, x: r0.x, y: r0.y, type: 'offcurve', smooth: false },
      { id: ids.idSplitAnchor, x: S.x, y: S.y, type: 'curve', smooth: false },
      { id: ids.idNew3, x: r1.x, y: r1.y, type: 'offcurve', smooth: false },
      { id: ids.idNew4, x: q2.x, y: q2.y, type: 'offcurve', smooth: false },
      to,
    ];
  }
  // qcurve
  const h = c.points[seg.hIdx]!;
  const { q0, S, q1 } = splitQuadraticAt(
    { x: from.x, y: from.y },
    { x: h.x, y: h.y },
    { x: to.x, y: to.y },
    tt,
  );
  // Verify qcurveAt matches S (no-op but keeps the import live if someone
  // refactors splitQuadraticAt): the split value equals the point-on-curve.
  void quadraticAt;
  // Replace [from, h, to] with [from, q0', S(qcurve), q1', to].
  return [
    from,
    { id: ids.idNew1, x: q0.x, y: q0.y, type: 'offcurve', smooth: false },
    { id: ids.idSplitAnchor, x: S.x, y: S.y, type: 'qcurve', smooth: false },
    { id: ids.idNew2, x: q1.x, y: q1.y, type: 'offcurve', smooth: false },
    to,
  ];
}
