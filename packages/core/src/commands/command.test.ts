import { test, expect } from 'vitest';
import type { Command } from './command.js';
import { UndoRedoStack } from './command.js';

type Counter = { value: number };

const inc: Command<Counter> = {
  type: 'inc',
  apply: (s) => ({ value: s.value + 1 }),
  revert: (s) => ({ value: s.value - 1 }),
};

test('apply pushes onto the undo stack and clears redo', () => {
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, inc);
  expect(s.value).toBe(1);
  expect(stack.canUndo()).toBe(true);
  expect(stack.canRedo()).toBe(false);
});

test('undo reverts and moves command to redo', () => {
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, inc);
  s = stack.undo(s)!;
  expect(s.value).toBe(0);
  expect(stack.canRedo()).toBe(true);
});

test('redo re-applies', () => {
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, inc);
  s = stack.undo(s)!;
  s = stack.redo(s)!;
  expect(s.value).toBe(1);
});

test('apply after undo clears redo', () => {
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, inc);
  s = stack.undo(s)!;
  s = stack.apply(s, inc);
  expect(stack.canRedo()).toBe(false);
});

test('mergeable consecutive commands collapse', () => {
  const mergeableInc: Command<Counter> = {
    type: 'inc',
    apply: (s) => ({ value: s.value + 1 }),
    revert: (s) => ({ value: s.value - 1 }),
    canMergeWith: (other) => other.type === 'inc',
    mergeWith: (other) => ({
      type: 'inc',
      apply: (s) => other.apply(mergeableInc.apply(s)),
      revert: (s) => mergeableInc.revert(other.revert(s)),
    }),
  };
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, mergeableInc);
  s = stack.apply(s, mergeableInc);
  expect(s.value).toBe(2);
  s = stack.undo(s)!;
  expect(s.value).toBe(0);
});

test('capacity drops oldest commands', () => {
  const stack = new UndoRedoStack<Counter>(2);
  let s: Counter = { value: 0 };
  for (let i = 0; i < 5; i++) s = stack.apply(s, inc);
  s = stack.undo(s)!;
  s = stack.undo(s)!;
  expect(stack.canUndo()).toBe(false);
  expect(s.value).toBe(3);
});
