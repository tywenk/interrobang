/**
 * Selection model for the canvas.
 *
 * Anchors and handles are kept in separate sets so marquee, keyboard nudge,
 * handle-drag-as-first-class, and "select all anchors" each have unambiguous
 * semantics without a kind-flag per id. Render, hit-test, and command layers
 * treat the two kinds distinctly.
 */
export interface Selection {
  readonly anchors: ReadonlySet<string>;
  readonly handles: ReadonlySet<string>;
}

export const EMPTY_SELECTION: Selection = Object.freeze({
  anchors: new Set<string>(),
  handles: new Set<string>(),
});

export function selectionSize(s: Selection): number {
  return s.anchors.size + s.handles.size;
}

export function selectionHas(s: Selection, id: string): boolean {
  return s.anchors.has(id) || s.handles.has(id);
}

export function selectionEquals(a: Selection, b: Selection): boolean {
  return setEquals(a.anchors, b.anchors) && setEquals(a.handles, b.handles);
}

function setEquals<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Flatten to a single set of ids — used for legacy consumers. */
export function selectionIds(s: Selection): ReadonlySet<string> {
  if (s.handles.size === 0) return s.anchors;
  if (s.anchors.size === 0) return s.handles;
  const out = new Set<string>(s.anchors);
  for (const id of s.handles) out.add(id);
  return out;
}

export function makeSelection(
  anchors: Iterable<string> = [],
  handles: Iterable<string> = [],
): Selection {
  return { anchors: new Set(anchors), handles: new Set(handles) };
}
