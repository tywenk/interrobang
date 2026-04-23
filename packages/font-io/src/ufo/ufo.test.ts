import { emptyFont, newId, type Font, type Glyph } from '@interrobang/core';
import { test, expect } from 'vitest';

import { parsePlist, writePlist } from './plist.js';
import { fontToUfo, ufoToFont } from './ufo.js';

function withGlyphs(font: Font, names: string[]): Font {
  const glyphs: { [id: string]: Glyph } = { ...font.glyphs };
  const glyphOrder = [...font.glyphOrder];
  const masterId = font.masters[0]!.id;
  for (const name of names) {
    const id = newId();
    glyphs[id] = {
      id,
      name,
      advanceWidth: 500,
      unicodeCodepoint: null,
      revision: 0,
      layers: [
        {
          id: newId(),
          masterId,
          contours: [],
          components: [],
          anchors: [],
        },
      ],
    };
    glyphOrder.push(id);
  }
  return { ...font, glyphs, glyphOrder };
}

test('round-trip empty font through UFO file map', () => {
  const f0 = emptyFont('Test Family');
  const files = fontToUfo(f0);
  expect(files.has('metainfo.plist')).toBe(true);
  expect(files.has('fontinfo.plist')).toBe(true);
  expect(files.has('glyphs/contents.plist')).toBe(true);
  const f1 = ufoToFont(files);
  expect(f1.meta.familyName).toBe('Test Family');
  expect(f1.meta.unitsPerEm).toBe(f0.meta.unitsPerEm);
});

test('metainfo.plist includes formatVersion 3 and formatVersionMinor 0', () => {
  const files = fontToUfo(emptyFont('T'));
  const metainfo = parsePlist(new TextDecoder().decode(files.get('metainfo.plist')!)) as Record<
    string,
    unknown
  >;
  expect(metainfo.formatVersion).toBe(3);
  expect(metainfo.formatVersionMinor).toBe(0);
  expect(metainfo.creator).toBe('app.interrobang');
});

test('encodes uppercase glyph names with trailing underscore', () => {
  const f = withGlyphs(emptyFont('T'), ['A', 'AE']);
  const files = fontToUfo(f);
  expect(files.has('glyphs/A_.glif')).toBe(true);
  expect(files.has('glyphs/A_E_.glif')).toBe(true);
});

test('replaces illegal characters in glyph names', () => {
  const f = withGlyphs(emptyFont('T'), ['a:b', 'x|y', 'p?q']);
  const files = fontToUfo(f);
  expect(files.has('glyphs/a_b.glif')).toBe(true);
  expect(files.has('glyphs/x_y.glif')).toBe(true);
  expect(files.has('glyphs/p_q.glif')).toBe(true);
});

test('escapes a leading period on glyph names', () => {
  const f = withGlyphs(emptyFont('T'), ['.notdef']);
  const files = fontToUfo(f);
  expect(files.has('glyphs/_notdef.glif')).toBe(true);
});

test('prefixes Windows-reserved basenames with an underscore', () => {
  const f = withGlyphs(emptyFont('T'), ['con', 'com1.alt', 'nul']);
  const files = fontToUfo(f);
  expect(files.has('glyphs/_con.glif')).toBe(true);
  expect(files.has('glyphs/_com1.alt.glif')).toBe(true);
  expect(files.has('glyphs/_nul.glif')).toBe(true);
});

test('resolves filename collisions after illegal-char replacement', () => {
  // Two distinct glyph names that both encode to the same basename "a_b".
  const f = withGlyphs(emptyFont('T'), ['a:b', 'a|b']);
  const files = fontToUfo(f);
  expect(files.has('glyphs/a_b.glif')).toBe(true);
  expect(files.has('glyphs/a_b000000000000001.glif')).toBe(true);
});

test('ufoToFont throws when metainfo.plist is missing', () => {
  const files = fontToUfo(emptyFont('T'));
  files.delete('metainfo.plist');
  expect(() => ufoToFont(files)).toThrow(/metainfo\.plist/);
});

test('ufoToFont throws on unsupported formatVersion', () => {
  const files = fontToUfo(emptyFont('T'));
  files.set(
    'metainfo.plist',
    new TextEncoder().encode(writePlist({ creator: 'test', formatVersion: 2 })),
  );
  expect(() => ufoToFont(files)).toThrow(/formatVersion/);
});
