import type { Contour, Glyph, Layer } from '@interrobang/core';
import { match } from 'ts-pattern';

import type { Viewport } from './viewport.js';

export interface RenderTheme {
  outline: string;
  point: string;
  pointSelected: string;
  pointOff: string;
  handle: string;
}

export const DEFAULT_THEME: RenderTheme = {
  outline: '#e6e6e6',
  point: '#3aa9ff',
  pointSelected: '#ff7a3a',
  pointOff: '#9aa0a6',
  handle: '#5a6066',
};

const POINT_RADIUS = 3.5;

export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  viewport: Viewport,
  selectedPointIds: ReadonlySet<string>,
  theme: RenderTheme = DEFAULT_THEME,
): void {
  for (const contour of layer.contours) drawContourPath(ctx, contour, viewport, theme);
  for (const contour of layer.contours)
    drawContourPoints(ctx, contour, viewport, selectedPointIds, theme);
}

function drawContourPath(
  ctx: CanvasRenderingContext2D,
  contour: Contour,
  vp: Viewport,
  theme: RenderTheme,
): void {
  if (contour.points.length === 0) return;
  ctx.beginPath();
  const first = vp.fontToScreen(contour.points[0]!.x, contour.points[0]!.y);
  ctx.moveTo(first.x, first.y);
  let i = 1;
  while (i < contour.points.length) {
    const p = contour.points[i]!;
    const screen = vp.fontToScreen(p.x, p.y);
    match(p.type)
      .with('line', () => {
        ctx.lineTo(screen.x, screen.y);
      })
      .with('qcurve', () => {
        const c = vp.fontToScreen(contour.points[i - 1]!.x, contour.points[i - 1]!.y);
        ctx.quadraticCurveTo(c.x, c.y, screen.x, screen.y);
      })
      .with('curve', () => {
        const c1 = vp.fontToScreen(contour.points[i - 2]!.x, contour.points[i - 2]!.y);
        const c2 = vp.fontToScreen(contour.points[i - 1]!.x, contour.points[i - 1]!.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, screen.x, screen.y);
      })
      .with('offcurve', () => {
        // offcurves contribute via the curve/qcurve segment that consumes them
      })
      .exhaustive();
    i += 1;
  }
  if (contour.closed) ctx.closePath();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = theme.outline;
  ctx.stroke();
}

/**
 * Produce a shallow-cloned glyph with `pointIds` translated by (dx, dy). Used
 * by the editor canvas to render a live drag preview without mutating the
 * controlled glyph prop.
 */
export function previewMove(
  glyph: Glyph,
  pointIds: readonly string[],
  dx: number,
  dy: number,
): Glyph {
  const ids = new Set(pointIds);
  return {
    ...glyph,
    layers: glyph.layers.map((layer) => ({
      ...layer,
      contours: layer.contours.map((c) => ({
        ...c,
        points: c.points.map((p) => (ids.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
      })),
    })),
  };
}

function drawContourPoints(
  ctx: CanvasRenderingContext2D,
  contour: Contour,
  vp: Viewport,
  selected: ReadonlySet<string>,
  theme: RenderTheme,
): void {
  for (const p of contour.points) {
    const screen = vp.fontToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = selected.has(p.id)
      ? theme.pointSelected
      : p.type === 'offcurve'
        ? theme.pointOff
        : theme.point;
    ctx.fill();
  }
}
