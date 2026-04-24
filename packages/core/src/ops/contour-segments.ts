import type { Contour, Point } from '../contour.js';

/**
 * A derived view of a contour as a sequence of segments. The underlying point
 * array is the source of truth — segments are recomputed on demand. Contours
 * are small, so caching is not worthwhile.
 *
 * Cubic segments carry two handle indices (hA before hB in point order);
 * qcurve segments carry one; line segments carry none. Anchor indices point
 * at the non-offcurve endpoints in `contour.points`.
 */
export type Segment =
  | { readonly kind: 'line'; readonly fromIdx: number; readonly toIdx: number }
  | {
      readonly kind: 'cubic';
      readonly fromIdx: number;
      readonly hAIdx: number;
      readonly hBIdx: number;
      readonly toIdx: number;
    }
  | {
      readonly kind: 'qcurve';
      readonly fromIdx: number;
      readonly hIdx: number;
      readonly toIdx: number;
    };

function isAnchor(p: Point): boolean {
  return p.type !== 'offcurve';
}

function firstAnchorIdx(contour: Contour): number {
  return contour.points.findIndex(isAnchor);
}

/**
 * Derive the ordered list of segments from a contour's flat point array.
 *
 * Walks from the first anchor forward: offcurves accumulate into a pending
 * handle buffer until the next anchor closes the segment. The segment kind
 * is driven by the closing anchor's `type`:
 *   line  → zero handles
 *   curve → expects two handles (cubic)
 *   qcurve → expects one handle (quadratic)
 *
 * Mismatches (e.g. a `curve` anchor with one buffered handle) are skipped
 * rather than throwing — renderers already tolerate malformed sequences.
 *
 * Closed contours get a trailing wrap segment from the last anchor back to
 * the first; its handles are the offcurves that appear after the last anchor
 * in storage order.
 */
export function segmentsOf(contour: Contour): readonly Segment[] {
  const pts = contour.points;
  const n = pts.length;
  if (n === 0) return [];
  const firstIdx = firstAnchorIdx(contour);
  if (firstIdx < 0) return [];

  const out: Segment[] = [];
  let prevAnchorIdx = firstIdx;
  const handleBuf: number[] = [];

  for (let i = firstIdx + 1; i < n; i++) {
    const p = pts[i]!;
    if (p.type === 'offcurve') {
      handleBuf.push(i);
      continue;
    }
    const seg = buildSegment(prevAnchorIdx, handleBuf, i, p.type);
    if (seg) out.push(seg);
    handleBuf.length = 0;
    prevAnchorIdx = i;
  }

  if (contour.closed) {
    // Trailing offcurves (after last anchor) belong to the wrap segment.
    for (let i = 0; i < firstIdx; i++) {
      const p = pts[i]!;
      if (p.type === 'offcurve') handleBuf.push(i);
    }
    const first = pts[firstIdx]!;
    const seg = buildSegment(prevAnchorIdx, handleBuf, firstIdx, first.type);
    if (seg) out.push(seg);
  }

  return out;
}

function buildSegment(
  fromIdx: number,
  handles: readonly number[],
  toIdx: number,
  toType: Point['type'],
): Segment | null {
  if (toType === 'line') {
    if (handles.length !== 0) return null;
    return { kind: 'line', fromIdx, toIdx };
  }
  if (toType === 'qcurve') {
    if (handles.length !== 1) return null;
    return { kind: 'qcurve', fromIdx, hIdx: handles[0]!, toIdx };
  }
  if (toType === 'curve') {
    if (handles.length !== 2) return null;
    return { kind: 'cubic', fromIdx, hAIdx: handles[0]!, hBIdx: handles[1]!, toIdx };
  }
  return null;
}

/**
 * Offcurves attached to the given anchor (in the flat point array).
 *
 * `out` is the offcurve immediately after the anchor (the outgoing handle);
 * `in` is the offcurve(s) immediately before. For cubics, either side can
 * have one handle — they belong to different segments. At open-contour
 * boundaries the missing side returns undefined.
 */
export function adjacentOffcurves(
  contour: Contour,
  anchorIdx: number,
): { in?: number; out?: number } {
  const pts = contour.points;
  const n = pts.length;
  if (n === 0 || anchorIdx < 0 || anchorIdx >= n) return {};
  const p = pts[anchorIdx];
  if (!p || !isAnchor(p)) return {};

  let outIdx: number | undefined;
  {
    const next = anchorIdx + 1;
    if (next < n) {
      if (pts[next]!.type === 'offcurve') outIdx = next;
    } else if (contour.closed && n > 0) {
      if (pts[0]!.type === 'offcurve') outIdx = 0;
    }
  }

  let inIdx: number | undefined;
  {
    const prev = anchorIdx - 1;
    if (prev >= 0) {
      if (pts[prev]!.type === 'offcurve') inIdx = prev;
    } else if (contour.closed && n > 0) {
      if (pts[n - 1]!.type === 'offcurve') inIdx = n - 1;
    }
  }

  return { in: inIdx, out: outIdx };
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * de Casteljau subdivision of a cubic bezier at parameter t ∈ [0, 1].
 * Returns the 5 new interior points; together with the original endpoints
 * this yields the 7-point replacement `[p0, q0, r0, S, r1, q2, p3]`.
 */
export function splitCubicAt(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  t: number,
): { q0: Vec2; r0: Vec2; S: Vec2; r1: Vec2; q2: Vec2 } {
  const q0 = lerp(p0, p1, t);
  const q1 = lerp(p1, p2, t);
  const q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const S = lerp(r0, r1, t);
  return { q0, r0, S, r1, q2 };
}

/**
 * de Casteljau subdivision of a quadratic bezier at parameter t ∈ [0, 1].
 * Returns the 3 new interior points; replacement sequence is `[p0, q0, S, q1, p2]`.
 */
export function splitQuadraticAt(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  t: number,
): { q0: Vec2; S: Vec2; q1: Vec2 } {
  const q0 = lerp(p0, p1, t);
  const q1 = lerp(p1, p2, t);
  const S = lerp(q0, q1, t);
  return { q0, S, q1 };
}

/** Sample a cubic bezier at parameter t ∈ [0, 1]. */
export function cubicAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
  };
}

/** Sample a quadratic bezier at parameter t ∈ [0, 1]. */
export function quadraticAt(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** Sample count for curve flattening during hit-tests. */
export const SEGMENT_FLATTEN_STEPS = 16;

/**
 * Flatten a segment into (SEGMENT_FLATTEN_STEPS + 1) font-space samples
 * `[p0, …, pN]`. Each sample carries the parameter `t` that produced it,
 * so callers can recover the split point for inserting an anchor.
 */
export function flattenSegment(seg: Segment, contour: Contour): readonly { pt: Vec2; t: number }[] {
  const pts = contour.points;
  const a = pts[seg.fromIdx]!;
  const b = pts[seg.toIdx]!;
  if (seg.kind === 'line') {
    return [
      { pt: { x: a.x, y: a.y }, t: 0 },
      { pt: { x: b.x, y: b.y }, t: 1 },
    ];
  }
  const samples: { pt: Vec2; t: number }[] = [];
  const steps = SEGMENT_FLATTEN_STEPS;
  if (seg.kind === 'cubic') {
    const hA = pts[seg.hAIdx]!;
    const hB = pts[seg.hBIdx]!;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      samples.push({ pt: cubicAt(a, hA, hB, b, t), t });
    }
    return samples;
  }
  // qcurve
  const h = pts[seg.hIdx]!;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    samples.push({ pt: quadraticAt(a, h, b, t), t });
  }
  return samples;
}
