import type { Contour, Glyph, Layer } from '@interrobang/core';
import { adjacentOffcurves } from '@interrobang/core';
import { match } from 'ts-pattern';

import { EMPTY_SELECTION, type Selection } from './selection.js';
import type { Viewport } from './viewport.js';

export interface RenderTheme {
  outline: string;
  point: string;
  pointSelected: string;
  pointOff: string;
  handle: string;
  handleSelected: string;
  marquee: string;
}

export const DEFAULT_THEME: RenderTheme = {
  outline: '#e6e6e6',
  point: '#3aa9ff',
  pointSelected: '#ff7a3a',
  pointOff: '#9aa0a6',
  handle: '#5a6066',
  handleSelected: '#ff7a3a',
  marquee: '#3aa9ff',
};

const POINT_RADIUS = 3.5;
const HANDLE_HALF = 3;
const HANDLE_LINE_WIDTH = 1;

export interface DrawLayerOptions {
  selection?: Selection;
  marquee?: { sx0: number; sy0: number; sx1: number; sy1: number };
  theme?: RenderTheme;
}

/**
 * Paint a full layer: outline paths, then handles (only on selected anchors),
 * then anchors, then the marquee overlay.
 *
 * Overload accepts the legacy signature `drawLayer(ctx, layer, vp, Set<id>)`
 * where the set is treated as the selected-anchor ids.
 */
export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  viewport: Viewport,
  optsOrSelection?: DrawLayerOptions | ReadonlySet<string>,
): void {
  const opts: DrawLayerOptions = isLegacySelection(optsOrSelection)
    ? { selection: { anchors: optsOrSelection, handles: new Set() } }
    : (optsOrSelection ?? {});
  const theme = opts.theme ?? DEFAULT_THEME;
  const selection = opts.selection ?? EMPTY_SELECTION;

  for (const contour of layer.contours) drawContourPath(ctx, contour, viewport, theme);
  for (const contour of layer.contours)
    drawContourHandles(ctx, contour, viewport, selection, theme);
  for (const contour of layer.contours)
    drawContourAnchors(ctx, contour, viewport, selection, theme);
  if (opts.marquee) drawMarquee(ctx, opts.marquee, theme);
}

function isLegacySelection(
  x: DrawLayerOptions | ReadonlySet<string> | undefined,
): x is ReadonlySet<string> {
  return x instanceof Set;
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

function drawContourHandles(
  ctx: CanvasRenderingContext2D,
  contour: Contour,
  vp: Viewport,
  selection: Selection,
  theme: RenderTheme,
): void {
  if (selection.anchors.size === 0) return;
  for (let i = 0; i < contour.points.length; i++) {
    const p = contour.points[i]!;
    if (p.type === 'offcurve') continue;
    if (!selection.anchors.has(p.id)) continue;
    const adj = adjacentOffcurves(contour, i);
    const anchorScreen = vp.fontToScreen(p.x, p.y);
    for (const hIdx of [adj.in, adj.out]) {
      if (hIdx === undefined) continue;
      const h = contour.points[hIdx]!;
      const hScreen = vp.fontToScreen(h.x, h.y);
      // Line from anchor to handle.
      ctx.beginPath();
      ctx.moveTo(anchorScreen.x, anchorScreen.y);
      ctx.lineTo(hScreen.x, hScreen.y);
      ctx.strokeStyle = theme.handle;
      ctx.lineWidth = HANDLE_LINE_WIDTH;
      ctx.stroke();
      // Handle square (hollow if unselected, filled orange if selected).
      const selected = selection.handles.has(h.id);
      ctx.beginPath();
      ctx.rect(hScreen.x - HANDLE_HALF, hScreen.y - HANDLE_HALF, HANDLE_HALF * 2, HANDLE_HALF * 2);
      if (selected) {
        ctx.fillStyle = theme.handleSelected;
        ctx.fill();
      } else {
        ctx.strokeStyle = theme.handle;
        ctx.lineWidth = HANDLE_LINE_WIDTH;
        ctx.stroke();
      }
    }
  }
}

function drawContourAnchors(
  ctx: CanvasRenderingContext2D,
  contour: Contour,
  vp: Viewport,
  selection: Selection,
  theme: RenderTheme,
): void {
  for (const p of contour.points) {
    if (p.type === 'offcurve') continue;
    const screen = vp.fontToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = selection.anchors.has(p.id) ? theme.pointSelected : theme.point;
    ctx.fill();
  }
}

function drawMarquee(
  ctx: CanvasRenderingContext2D,
  box: { sx0: number; sy0: number; sx1: number; sy1: number },
  theme: RenderTheme,
): void {
  const x = Math.min(box.sx0, box.sx1);
  const y = Math.min(box.sy0, box.sy1);
  const w = Math.abs(box.sx1 - box.sx0);
  const h = Math.abs(box.sy1 - box.sy0);
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = theme.marquee;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
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
