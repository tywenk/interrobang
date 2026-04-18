export type PointType = 'line' | 'curve' | 'qcurve' | 'offcurve';

export interface Point {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly type: PointType;
  readonly smooth: boolean;
}

export interface Contour {
  readonly id: string;
  readonly closed: boolean;
  readonly points: readonly Point[];
}

export interface Anchor {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

export interface ComponentRef {
  readonly id: string;
  readonly baseGlyph: string;
  readonly transform: readonly [number, number, number, number, number, number]; // 2x3 affine
}
