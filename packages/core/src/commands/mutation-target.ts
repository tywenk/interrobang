/**
 * Identifies a single row / entity that a command mutates, so the persistence
 * layer can apply a minimal SQL diff instead of a full-font rewrite.
 *
 * TODO(components): the 'component' variant is present from day one so the
 * pipeline (core commands → storage.applyMutation) is stable when reusable
 * glyph components land. No command writes a 'component' target today.
 */
export type MutationTarget =
  | { kind: 'meta'; projectId: string }
  | { kind: 'glyph'; glyphId: string }
  | { kind: 'layer'; glyphId: string; layerId: string }
  | { kind: 'kerning'; leftGlyph: string; rightGlyph: string }
  | { kind: 'component'; componentId: string };
