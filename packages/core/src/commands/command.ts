import type { MutationTarget } from './mutation-target.js';

export interface Command<T> {
  readonly type: string;
  /** Rows/entities this command mutates. Empty or omitted = full-state fallback. */
  affects?: readonly MutationTarget[];
  apply(state: T): T;
  revert(state: T): T;
  canMergeWith?(other: Command<T>): boolean;
  mergeWith?(other: Command<T>): Command<T>;
}

export class UndoRedoStack<T> {
  private undoStack: Command<T>[] = [];
  private redoStack: Command<T>[] = [];

  constructor(private readonly capacity: number = 200) {}

  apply(state: T, command: Command<T>): T {
    const next = command.apply(state);
    const last = this.undoStack[this.undoStack.length - 1];
    if (last && last.canMergeWith?.(command) && last.mergeWith) {
      this.undoStack[this.undoStack.length - 1] = last.mergeWith(command);
    } else {
      this.undoStack.push(command);
      if (this.undoStack.length > this.capacity) this.undoStack.shift();
    }
    this.redoStack = [];
    return next;
  }

  undo(state: T): T | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    this.redoStack.push(cmd);
    return cmd.revert(state);
  }

  redo(state: T): T | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    this.undoStack.push(cmd);
    return cmd.apply(state);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
