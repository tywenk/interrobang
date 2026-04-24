import type { Contour, Layer } from '@interrobang/core';
import { adjacentOffcurves, flattenSegment, segmentsOf } from '@interrobang/core';

import type { Viewport } from './viewport.js';

export type HitResult =
  | {
      readonly kind: 'anchor';
      readonly pointId: string;
      readonly contourId: string;
      readonly pointIndex: number;
    }
  | {
      readonly kind: 'handle';
      readonly pointId: string;
      readonly contourId: string;
      readonly pointIndex: number;
      /** The anchor this handle is attached to. */
      readonly anchorId: string;
    }
  | {
      readonly kind: 'segment';
      readonly contourId: string;
      readonly segmentIndex: number;
      /** Parameter along the segment where the click landed. */
      readonly t: number;
      readonly screenX: number;
      readonly screenY: number;
    }
  | null;

export interface HitTestOptions {
  /** Ids of selected anchors; only their attached offcurves are hittable as handles. */
  readonly selectedAnchors?: ReadonlySet<string>;
  /** Tolerance for anchor/handle hits in screen px. */
  readonly pointTolerancePx?: number;
  /** Tolerance for segment hits in screen px. */
  readonly segmentTolerancePx?: number;
}

const DEFAULT_POINT_TOLERANCE_PX = 8;
const DEFAULT_SEGMENT_TOLERANCE_PX = 5;

/**
 * Hit-test a layer at a screen point.
 *
 * Priority: anchors > handles (selection-gated) > segments. Within a priority
 * tier, closest-point wins.
 */
export function hitTest(
  layer: Layer,
  viewport: Viewport,
  screenX: number,
  screenY: number,
  options?: HitTestOptions | number,
): HitResult {
  // Back-compat: accept a bare tolerance number as the 5th arg (old signature).
  const opts: HitTestOptions =
    typeof options === 'number'
      ? { pointTolerancePx: options, segmentTolerancePx: options }
      : (options ?? {});
  const pointTol = opts.pointTolerancePx ?? DEFAULT_POINT_TOLERANCE_PX;
  const segTol = opts.segmentTolerancePx ?? DEFAULT_SEGMENT_TOLERANCE_PX;
  const selectedAnchors = opts.selectedAnchors;

  // 1. Anchors first.
  let bestAnchor: {
    dist: number;
    hit: Extract<HitResult, { kind: 'anchor' }>;
  } | null = null;
  for (const contour of layer.contours) {
    for (let i = 0; i < contour.points.length; i++) {
      const p = contour.points[i]!;
      if (p.type === 'offcurve') continue;
      const screen = viewport.fontToScreen(p.x, p.y);
      const dx = screen.x - screenX;
      const dy = screen.y - screenY;
      const dist = Math.hypot(dx, dy);
      if (dist <= pointTol && (bestAnchor === null || dist < bestAnchor.dist)) {
        bestAnchor = {
          dist,
          hit: { kind: 'anchor', pointId: p.id, contourId: contour.id, pointIndex: i },
        };
      }
    }
  }
  if (bestAnchor) return bestAnchor.hit;

  // 2. Handles, but only for offcurves attached to a currently selected anchor.
  if (selectedAnchors && selectedAnchors.size > 0) {
    let bestHandle: {
      dist: number;
      hit: Extract<HitResult, { kind: 'handle' }>;
    } | null = null;
    for (const contour of layer.contours) {
      const candidates = handleCandidates(contour, selectedAnchors);
      for (const c of candidates) {
        const p = contour.points[c.offcurveIdx]!;
        const screen = viewport.fontToScreen(p.x, p.y);
        const dx = screen.x - screenX;
        const dy = screen.y - screenY;
        const dist = Math.hypot(dx, dy);
        if (dist <= pointTol && (bestHandle === null || dist < bestHandle.dist)) {
          bestHandle = {
            dist,
            hit: {
              kind: 'handle',
              pointId: p.id,
              contourId: contour.id,
              pointIndex: c.offcurveIdx,
              anchorId: c.anchorId,
            },
          };
        }
      }
    }
    if (bestHandle) return bestHandle.hit;
  }

  // 3. Segments.
  let bestSeg: {
    dist: number;
    hit: Extract<HitResult, { kind: 'segment' }>;
  } | null = null;
  for (const contour of layer.contours) {
    const segs = segmentsOf(contour);
    for (let segIdx = 0; segIdx < segs.length; segIdx++) {
      const seg = segs[segIdx]!;
      const samples = flattenSegment(seg, contour);
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i]!;
        const b = samples[i + 1]!;
        const aS = viewport.fontToScreen(a.pt.x, a.pt.y);
        const bS = viewport.fontToScreen(b.pt.x, b.pt.y);
        const nearest = nearestPointOnLineSegment(aS.x, aS.y, bS.x, bS.y, screenX, screenY);
        if (nearest.dist <= segTol && (bestSeg === null || nearest.dist < bestSeg.dist)) {
          // Blend t between the two sample t's.
          const t = a.t + (b.t - a.t) * nearest.u;
          bestSeg = {
            dist: nearest.dist,
            hit: {
              kind: 'segment',
              contourId: contour.id,
              segmentIndex: segIdx,
              t,
              screenX,
              screenY,
            },
          };
        }
      }
    }
  }
  return bestSeg ? bestSeg.hit : null;
}

function handleCandidates(
  contour: Contour,
  selectedAnchors: ReadonlySet<string>,
): readonly { offcurveIdx: number; anchorId: string }[] {
  const out: { offcurveIdx: number; anchorId: string }[] = [];
  for (let i = 0; i < contour.points.length; i++) {
    const p = contour.points[i]!;
    if (p.type === 'offcurve') continue;
    if (!selectedAnchors.has(p.id)) continue;
    const adj = adjacentOffcurves(contour, i);
    if (adj.in !== undefined) out.push({ offcurveIdx: adj.in, anchorId: p.id });
    if (adj.out !== undefined) out.push({ offcurveIdx: adj.out, anchorId: p.id });
  }
  return out;
}

function nearestPointOnLineSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): { u: number; dist: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { u: 0, dist: Math.hypot(px - ax, py - ay) };
  let u = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  const cx = ax + u * dx;
  const cy = ay + u * dy;
  return { u, dist: Math.hypot(px - cx, py - cy) };
}
