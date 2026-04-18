import type { Glyph } from '@interrobang/core';

export interface ViewportOpts {
  canvasWidth: number;
  canvasHeight: number;
}

export class Viewport {
  private scale = 1;
  private originX: number;
  private originY: number;
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(opts: ViewportOpts) {
    this.canvasWidth = opts.canvasWidth;
    this.canvasHeight = opts.canvasHeight;
    this.originX = opts.canvasWidth / 2;
    this.originY = opts.canvasHeight / 2;
  }

  fontToScreen(fx: number, fy: number): { x: number; y: number } {
    return {
      x: this.originX + fx * this.scale,
      y: this.originY - fy * this.scale,
    };
  }

  screenToFont(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.originX) / this.scale,
      y: (this.originY - sy) / this.scale,
    };
  }

  zoomAbout(factor: number, screenX: number, screenY: number): void {
    const fontPt = this.screenToFont(screenX, screenY);
    this.scale *= factor;
    const newScreen = this.fontToScreen(fontPt.x, fontPt.y);
    this.originX += screenX - newScreen.x;
    this.originY += screenY - newScreen.y;
  }

  panBy(dx: number, dy: number): void {
    this.originX += dx;
    this.originY += dy;
  }

  getScale(): number {
    return this.scale;
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    // Shift origin by half the size delta so the on-screen font centre stays put.
    this.originX += (canvasWidth - this.canvasWidth) / 2;
    this.originY += (canvasHeight - this.canvasHeight) / 2;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  getCanvasSize(): { width: number; height: number } {
    return { width: this.canvasWidth, height: this.canvasHeight };
  }

  // Centre the glyph bbox in the canvas and scale so the glyph plus a margin
  // fits. Uses the font ascender/descender as a fallback bbox when a glyph has
  // no contours.
  fitToGlyph(glyph: Glyph, paddingPx = 40): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const layer of glyph.layers) {
      for (const contour of layer.contours) {
        for (const p of contour.points) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }
    }
    if (!Number.isFinite(minX)) {
      // Fallback: show a 1000×1000 area centred on origin.
      minX = 0;
      maxX = glyph.advanceWidth || 1000;
      minY = -200;
      maxY = 800;
    }
    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const usableW = Math.max(1, this.canvasWidth - paddingPx * 2);
    const usableH = Math.max(1, this.canvasHeight - paddingPx * 2);
    this.scale = Math.min(usableW / bboxW, usableH / bboxH);
    const centreFontX = (minX + maxX) / 2;
    const centreFontY = (minY + maxY) / 2;
    this.originX = this.canvasWidth / 2 - centreFontX * this.scale;
    this.originY = this.canvasHeight / 2 + centreFontY * this.scale;
  }
}
