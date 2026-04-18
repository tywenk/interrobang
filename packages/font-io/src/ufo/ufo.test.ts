import { test, expect } from 'bun:test';
import { emptyFont } from '@interrobang/core';
import { fontToUfo, ufoToFont } from './ufo.js';

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
