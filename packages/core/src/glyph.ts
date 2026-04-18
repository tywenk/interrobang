import type { Anchor, ComponentRef, Contour } from './contour.js';

export interface Layer {
  readonly id: string;
  readonly masterId: string;
  readonly contours: readonly Contour[];
  readonly components: readonly ComponentRef[];
  readonly anchors: readonly Anchor[];
}

export interface Glyph {
  readonly id: string;
  readonly name: string;
  readonly advanceWidth: number;
  readonly unicodeCodepoint: number | null;
  readonly layers: readonly Layer[];
  readonly revision: number;
}
