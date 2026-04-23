import { test, expect } from 'vitest';
import { createGlyph } from './glyph-ops.js';

test('createGlyph with triangle starter produces one layer with a three-point closed contour', () => {
  const g = createGlyph({ name: 'A', codepoint: 65, masterId: 'm1', starter: 'triangle' });
  expect(g.layers).toHaveLength(1);
  const layer = g.layers[0]!;
  expect(layer.masterId).toBe('m1');
  expect(layer.contours).toHaveLength(1);
  const contour = layer.contours[0]!;
  expect(contour.closed).toBe(true);
  expect(contour.points).toHaveLength(3);
  for (const p of contour.points) expect(p.type).toBe('line');
  expect(g.unicodeCodepoint).toBe(65);
  expect(g.name).toBe('A');
  expect(g.advanceWidth).toBe(500);
  expect(g.revision).toBe(0);
});

test('createGlyph with empty starter produces one layer with no contours', () => {
  const g = createGlyph({ name: 'B', codepoint: 66, masterId: 'm2', starter: 'empty' });
  expect(g.layers).toHaveLength(1);
  const layer = g.layers[0]!;
  expect(layer.masterId).toBe('m2');
  expect(layer.contours).toHaveLength(0);
});

test('createGlyph defaults to triangle starter when starter is omitted', () => {
  const g = createGlyph({ name: 'C', codepoint: null, masterId: 'm3' });
  expect(g.layers[0]!.contours).toHaveLength(1);
  expect(g.unicodeCodepoint).toBeNull();
});
