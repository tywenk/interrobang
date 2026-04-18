import type { Contour, Point } from '../contour.js';

export function insertPoint(contour: Contour, index: number, point: Point): Contour {
  const points = [...contour.points];
  points.splice(index, 0, point);
  return { ...contour, points };
}

export function removePoint(contour: Contour, pointId: string): Contour {
  const idx = contour.points.findIndex((p) => p.id === pointId);
  if (idx === -1) return contour;
  const points = [...contour.points];
  points.splice(idx, 1);
  return { ...contour, points };
}
