import type { Font, Glyph, Layer } from '../index.js';
import { nanoid as newId } from 'nanoid';

export interface CreateGlyphInput {
  name: string;
  codepoint: number | null;
  masterId: string;
  /** TODO(components): accept componentRefs here once component editing lands. */
  starter?: 'triangle' | 'empty';
}

export function createGlyph(input: CreateGlyphInput): Glyph {
  const { name, codepoint, masterId, starter = 'triangle' } = input;
  const glyphId = newId();
  const layerId = newId();
  const contours =
    starter === 'empty'
      ? []
      : [
          {
            id: newId(),
            closed: true,
            points: [
              { id: newId(), x: 100, y: 0, type: 'line' as const, smooth: false },
              { id: newId(), x: 400, y: 0, type: 'line' as const, smooth: false },
              { id: newId(), x: 250, y: 700, type: 'line' as const, smooth: false },
            ],
          },
        ];
  return {
    id: glyphId,
    name,
    advanceWidth: 500,
    unicodeCodepoint: codepoint,
    revision: 0,
    layers: [{ id: layerId, masterId, components: [], anchors: [], contours }],
  };
}

export function updateGlyph(font: Font, glyphId: string, updater: (g: Glyph) => Glyph): Font {
  const existing = font.glyphs[glyphId];
  if (!existing) return font;
  const updated = updater(existing);
  if (updated === existing) return font;
  return {
    ...font,
    glyphs: { ...font.glyphs, [glyphId]: { ...updated, revision: existing.revision + 1 } },
    revision: font.revision + 1,
  };
}

export function replaceLayer(glyph: Glyph, layer: Layer): Glyph {
  const layers = glyph.layers.map((l) => (l.id === layer.id ? layer : l));
  return { ...glyph, layers };
}

export function emptyFont(familyName: string): Font {
  const masterId = newId();
  return {
    id: newId(),
    meta: {
      familyName,
      styleName: 'Regular',
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      capHeight: 700,
      xHeight: 500,
    },
    masters: [{ id: masterId, name: 'Regular', weight: 400, width: 100 }],
    glyphs: {},
    glyphOrder: [],
    kerning: [],
    revision: 0,
  };
}
