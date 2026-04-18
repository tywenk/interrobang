import { test, expect } from 'bun:test';
import { newId } from './id.js';

test('newId returns a 21-char nanoid', () => {
  const id = newId();
  expect(id).toHaveLength(21);
  expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
});

test('newId is unique across many calls', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()));
  expect(ids.size).toBe(1000);
});
