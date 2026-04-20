import type { Font, Glyph, Layer } from '../index.js';
import { newId } from '../id.js';

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
