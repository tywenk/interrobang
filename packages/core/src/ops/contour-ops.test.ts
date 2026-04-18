import { test, expect } from 'bun:test';
import type { Contour, Point } from '../contour.js';
import { insertPoint, removePoint } from './contour-ops.js';

const p = (id: string, x: number, y: number, type: Point['type'] = 'line'): Point => ({
  id, x, y, type, smooth: false,
});

const square: Contour = {
  id: 'c1',
  closed: true,
  points: [p('a', 0, 0), p('b', 100, 0), p('c', 100, 100), p('d', 0, 100)],
};

test('insertPoint inserts at the given index', () => {
  const next = insertPoint(square, 2, p('x', 100, 50));
  expect(next.points.map((q) => q.id)).toEqual(['a', 'b', 'x', 'c', 'd']);
});

test('insertPoint at end appends', () => {
  const next = insertPoint(square, 4, p('x', 50, 50));
  expect(next.points.map((q) => q.id)).toEqual(['a', 'b', 'c', 'd', 'x']);
});

test('insertPoint preserves contour identity (id, closed)', () => {
  const next = insertPoint(square, 0, p('x', -10, 0));
  expect(next.id).toBe(square.id);
  expect(next.closed).toBe(square.closed);
});

test('insertPoint does not mutate input', () => {
  insertPoint(square, 0, p('x', -10, 0));
  expect(square.points.map((q) => q.id)).toEqual(['a', 'b', 'c', 'd']);
});

test('removePoint removes by id', () => {
  const next = removePoint(square, 'c');
  expect(next.points.map((q) => q.id)).toEqual(['a', 'b', 'd']);
});

test('removePoint with unknown id is a no-op', () => {
  const next = removePoint(square, 'zzz');
  expect(next).toBe(square);
});
