import { test, expect } from 'vitest';

test('happy-dom is registered', () => {
  expect(typeof document).toBe('object');
  const div = document.createElement('div');
  expect(div.tagName).toBe('DIV');
});
