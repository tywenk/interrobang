export interface ViewportOpts {
  canvasWidth: number;
  canvasHeight: number;
}

export class Viewport {
  private scale = 1;
  private originX: number;
  private originY: number;

  constructor(opts: ViewportOpts) {
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
    this.originX = canvasWidth / 2;
    this.originY = canvasHeight / 2;
  }
}
