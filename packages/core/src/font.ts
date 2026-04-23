import type { Glyph } from './glyph.js';

export interface Master {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly width: number;
}

export interface FontMeta {
  readonly familyName: string;
  readonly styleName: string;
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly capHeight: number;
  readonly xHeight: number;
  /**
   * Additional script-specific metrics (e.g. `ideographicTop`,
   * `hangingBaseline`, `sTypoLineGap`). Opaque to core: storage serializes
   * via JSON; font-io passes them through on round-trip. Optional so existing
   * callers stay unchanged.
   */
  readonly extraMetrics?: Readonly<Record<string, number>>;
}

export interface KerningPair {
  readonly leftGlyph: string;
  readonly rightGlyph: string;
  readonly value: number;
}

export interface Font {
  readonly id: string;
  readonly meta: FontMeta;
  readonly masters: readonly Master[];
  readonly glyphs: { readonly [glyphId: string]: Glyph };
  readonly glyphOrder: readonly string[];
  readonly kerning: readonly KerningPair[];
  readonly revision: number;
}
