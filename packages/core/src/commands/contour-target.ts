import type { Contour, Font } from '../index.js';
import { updateGlyph } from '../ops/glyph-ops.js';

export interface ContourTarget {
  readonly glyphId: string;
  readonly layerId: string;
  readonly contourId: string;
}

/**
 * Apply `fn` to the targeted contour, threading the change back through the
 * layer → glyph → font tree. Returns the original font unchanged if the
 * target doesn't resolve or `fn` is a no-op (returns the same contour).
 */
export function withContour(font: Font, t: ContourTarget, fn: (c: Contour) => Contour): Font {
  return updateGlyph(font, t.glyphId, (g) => {
    const layer = g.layers.find((l) => l.id === t.layerId);
    if (!layer) return g;
    const contour = layer.contours.find((c) => c.id === t.contourId);
    if (!contour) return g;
    const next = fn(contour);
    if (next === contour) return g;
    const layers = g.layers.map((l) =>
      l.id === t.layerId
        ? { ...l, contours: l.contours.map((c) => (c.id === t.contourId ? next : c)) }
        : l,
    );
    return { ...g, layers };
  });
}
