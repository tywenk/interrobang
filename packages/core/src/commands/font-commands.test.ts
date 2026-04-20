import { test, expect } from 'vitest';
import type { Font, Layer } from '../index.js';
import { createGlyph, emptyFont } from '../ops/glyph-ops.js';
import {
  movePointsCommand,
  insertPointCommand,
  convertPointTypeCommand,
  addGlyphCommand,
} from './font-commands.js';

function fontWithGlyph(): Font {
  const f = emptyFont('Test');
  const masterId = f.masters[0]!.id;
  const layer: Layer = {
    id: 'l1',
    masterId,
    contours: [
      {
        id: 'c1',
        closed: true,
        points: [
          { id: 'p1', x: 0, y: 0, type: 'line', smooth: false },
          { id: 'p2', x: 100, y: 0, type: 'line', smooth: false },
        ],
      },
    ],
    components: [],
    anchors: [],
  };
  return {
    ...f,
    glyphs: {
      g1: {
        id: 'g1',
        name: 'A',
        advanceWidth: 500,
        unicodeCodepoint: 65,
        layers: [layer],
        revision: 0,
      },
    },
    glyphOrder: ['g1'],
  };
}

test('movePointsCommand applies and reverts cleanly', () => {
  const f0 = fontWithGlyph();
  const cmd = movePointsCommand({
    glyphId: 'g1',
    layerId: 'l1',
    contourId: 'c1',
    pointIds: ['p2'],
    dx: 5,
    dy: 7,
  });
  const f1 = cmd.apply(f0);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.x).toBe(105);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.y).toBe(7);
  const f2 = cmd.revert(f1);
  expect(f2.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.x).toBe(100);
  expect(f2.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.y).toBe(0);
});

test('insertPointCommand and removePointCommand are inverses', () => {
  const f0 = fontWithGlyph();
  const newPoint = { id: 'p3', x: 100, y: 50, type: 'line' as const, smooth: false };
  const insert = insertPointCommand({
    glyphId: 'g1',
    layerId: 'l1',
    contourId: 'c1',
    index: 2,
    point: newPoint,
  });
  const f1 = insert.apply(f0);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points).toHaveLength(3);
  const f2 = insert.revert(f1);
  expect(f2.glyphs.g1!.layers[0]!.contours[0]!.points).toHaveLength(2);
});

test('convertPointTypeCommand round-trips', () => {
  const f0 = fontWithGlyph();
  const cmd = convertPointTypeCommand({
    glyphId: 'g1',
    layerId: 'l1',
    contourId: 'c1',
    pointId: 'p2',
    newType: 'curve',
  });
  const f1 = cmd.apply(f0);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.type).toBe('curve');
  const f2 = cmd.revert(f1);
  expect(f2.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.type).toBe('line');
});

test('addGlyphCommand round-trips: apply then revert returns original font', () => {
  const f0 = emptyFont('Test');
  const masterId = f0.masters[0]!.id;
  const glyph = createGlyph({ name: 'A', codepoint: 65, masterId, starter: 'triangle' });
  const cmd = addGlyphCommand({ glyph });
  const f1 = cmd.apply(f0);
  expect(f1.glyphs[glyph.id]).toBe(glyph);
  expect(f1.glyphOrder).toContain(glyph.id);
  const f2 = cmd.revert(f1);
  expect(f2.glyphs).toEqual(f0.glyphs);
  expect(f2.glyphOrder).toEqual(f0.glyphOrder);
});

test('addGlyphCommand apply is idempotent when the glyph id already exists', () => {
  const f0 = emptyFont('Test');
  const masterId = f0.masters[0]!.id;
  const glyph = createGlyph({ name: 'A', codepoint: 65, masterId });
  const cmd = addGlyphCommand({ glyph });
  const f1 = cmd.apply(f0);
  const f2 = cmd.apply(f1);
  expect(f2).toBe(f1);
});

test('two consecutive movePoints commands on the same point set merge', () => {
  const a = movePointsCommand({
    glyphId: 'g1',
    layerId: 'l1',
    contourId: 'c1',
    pointIds: ['p2'],
    dx: 1,
    dy: 0,
  });
  const b = movePointsCommand({
    glyphId: 'g1',
    layerId: 'l1',
    contourId: 'c1',
    pointIds: ['p2'],
    dx: 2,
    dy: 0,
  });
  expect(a.canMergeWith?.(b)).toBe(true);
  const merged = a.mergeWith!(b);
  const f0 = fontWithGlyph();
  const f1 = merged.apply(f0);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.x).toBe(103);
});
