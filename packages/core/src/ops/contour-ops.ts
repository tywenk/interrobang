import type { Contour, Point, PointType } from '../contour.js';

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

export function movePoints(
  contour: Contour,
  pointIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): Contour {
  if (pointIds.size === 0) return contour;
  const points = contour.points.map((p) =>
    pointIds.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p,
  );
  return { ...contour, points };
}

export function convertPointType(contour: Contour, pointId: string, newType: PointType): Contour {
  const points = contour.points.map((p) => (p.id === pointId ? { ...p, type: newType } : p));
  return { ...contour, points };
}
