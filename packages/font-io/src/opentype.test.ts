import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOTF, writeOTF } from './opentype.js';

const sample = new Uint8Array(readFileSync(join(import.meta.dir, '../test-fixtures/sample.ttf')));

test('parseOTF returns a Font with a glyph map', () => {
  const font = parseOTF(sample.buffer as ArrayBuffer);
  expect(font.meta.familyName).toBeTruthy();
  expect(font.meta.unitsPerEm).toBeGreaterThan(0);
  expect(font.glyphOrder.length).toBeGreaterThan(10);
  const someName = font.glyphOrder[0]!;
  expect(font.glyphs[someName]).toBeDefined();
});

test('parseOTF surfaces unicode codepoints for ASCII glyphs', () => {
  const font = parseOTF(sample.buffer as ArrayBuffer);
  const A = Object.values(font.glyphs).find((g) => g.unicodeCodepoint === 65);
  expect(A?.name).toBeTruthy();
});

test('writeOTF round-trips family name and unitsPerEm', () => {
  const font = parseOTF(sample.buffer as ArrayBuffer);
  const bytes = writeOTF(font);
  const reparsed = parseOTF(bytes);
  expect(reparsed.meta.familyName).toBe(font.meta.familyName);
  expect(reparsed.meta.unitsPerEm).toBe(font.meta.unitsPerEm);
  expect(reparsed.glyphOrder.length).toBeGreaterThan(0);
});

