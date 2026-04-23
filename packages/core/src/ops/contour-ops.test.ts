import { test, expect } from 'vitest';
import type { Contour, Point } from '../contour.js';
import { convertPointType, insertPoint, movePoints, removePoint } from './contour-ops.js';

const p = (id: string, x: number, y: number, type: Point['type'] = 'line'): Point => ({
  id,
  x,
  y,
  type,
  smooth: false,
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

test('movePoints translates the listed point ids', () => {
  const next = movePoints(square, new Set(['b', 'c']), 5, -3);
  const byId = Object.fromEntries(next.points.map((q) => [q.id, q]));
  expect(byId.a).toEqual(square.points[0]!);
  expect(byId.b).toMatchObject({ x: 105, y: -3 });
  expect(byId.c).toMatchObject({ x: 105, y: 97 });
  expect(byId.d).toEqual(square.points[3]!);
});

test('movePoints with empty set is a no-op (same reference)', () => {
  expect(movePoints(square, new Set(), 5, 5)).toBe(square);
});

test('convertPointType changes type by id', () => {
  const next = convertPointType(square, 'b', 'curve');
  expect(next.points[1]!.type).toBe('curve');
  expect(next.points[0]!.type).toBe('line');
});
