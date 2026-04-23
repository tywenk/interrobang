import type { Layer } from '@interrobang/core';

import type { Viewport } from './viewport.js';

export type HitResult = { kind: 'point'; pointId: string; contourId: string } | null;

export function hitTest(
  layer: Layer,
  viewport: Viewport,
  screenX: number,
  screenY: number,
  tolerancePx: number,
): HitResult {
  let best: { dist: number; result: HitResult } = { dist: Infinity, result: null };
  for (const contour of layer.contours) {
    for (const p of contour.points) {
      const screen = viewport.fontToScreen(p.x, p.y);
      const dx = screen.x - screenX;
      const dy = screen.y - screenY;
      const dist = Math.hypot(dx, dy);
      if (dist <= tolerancePx && dist < best.dist) {
        best = {
          dist,
          result: { kind: 'point', pointId: p.id, contourId: contour.id },
        };
      }
    }
  }
  return best.result;
}
