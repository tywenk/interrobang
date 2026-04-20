import type { MutationTarget } from './mutation-target.js';

export interface Command<T> {
  readonly type: string;
  /**
   * Rows/entities this command mutates. Used by the persistence layer to
   * compute a minimal SQL diff on apply AND on revert (reverse-affects are
   * always the same set of rows, since undoing a change still rewrites the
   * same rows to their previous values).
   */
  affects: readonly MutationTarget[];
  apply(state: T): T;
  revert(state: T): T;
  canMergeWith?(other: Command<T>): boolean;
  mergeWith?(other: Command<T>): Command<T>;
}

/**
 * Result of an undo or redo: both the new state AND the command that was
 * toggled, so callers can read its `affects` to route an incremental save.
 */
export interface ToggleResult<T> {
  state: T;
  command: Command<T>;
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

  undo(state: T): ToggleResult<T> | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    this.redoStack.push(cmd);
    return { state: cmd.revert(state), command: cmd };
  }

  redo(state: T): ToggleResult<T> | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    this.undoStack.push(cmd);
    return { state: cmd.apply(state), command: cmd };
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
