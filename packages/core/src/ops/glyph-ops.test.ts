import { test, expect } from 'vitest';
import type { Font, Glyph, Layer } from '../index.js';
import { updateGlyph, replaceLayer, emptyFont } from './glyph-ops.js';

const layer: Layer = { id: 'l1', masterId: 'm1', contours: [], components: [], anchors: [] };
const glyph: Glyph = {
  id: 'g1',
  name: 'A',
  advanceWidth: 500,
  unicodeCodepoint: 65,
  layers: [layer],
  revision: 0,
};
const font: Font = {
  id: 'f1',
  meta: {
    familyName: 'X',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    capHeight: 700,
    xHeight: 500,
  },
  masters: [{ id: 'm1', name: 'Regular', weight: 400, width: 100 }],
  glyphs: { g1: glyph },
  glyphOrder: ['g1'],
  kerning: [],
  revision: 0,
};

test('updateGlyph replaces the glyph and bumps revisions', () => {
  const next = updateGlyph(font, 'g1', (g) => ({ ...g, advanceWidth: 600 }));
  expect(next.glyphs.g1!.advanceWidth).toBe(600);
  expect(next.glyphs.g1!.revision).toBe(glyph.revision + 1);
  expect(next.revision).toBe(font.revision + 1);
  expect(next).not.toBe(font);
});

test('replaceLayer swaps a layer by id', () => {
  const newLayer: Layer = { ...layer, contours: [{ id: 'c1', closed: true, points: [] }] };
  const next = replaceLayer(glyph, newLayer);
  expect(next.layers[0]!.contours).toHaveLength(1);
});

test('emptyFont returns a usable font with one master and no glyphs', () => {
  const f = emptyFont('My Font');
  expect(f.meta.familyName).toBe('My Font');
  expect(f.masters).toHaveLength(1);
  expect(f.glyphOrder).toHaveLength(0);
});
