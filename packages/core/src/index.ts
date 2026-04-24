export type { Point, PointType, Contour, Anchor, ComponentRef } from './contour.js';
export type { Glyph, Layer } from './glyph.js';
export type { Font, FontMeta, Master, KerningPair } from './font.js';
export { nanoid as newId } from 'nanoid';
export type { Command, ToggleResult } from './commands/command.js';
export { UndoRedoStack } from './commands/command.js';
export type { MutationTarget } from './commands/mutation-target.js';
export {
  movePointsCommand,
  insertPointCommand,
  removePointCommand,
  convertPointTypeCommand,
  addGlyphCommand,
  unionAffects,
} from './commands/font-commands.js';
export {
  convertLineSegmentToCurveCommand,
  insertAnchorOnSegmentCommand,
} from './commands/segment-commands.js';
export type {
  ConvertLineSegmentToCurveArgs,
  InsertAnchorOnSegmentArgs,
} from './commands/segment-commands.js';
export { emptyFont, updateGlyph, replaceLayer, createGlyph } from './ops/glyph-ops.js';
export type { CreateGlyphInput } from './ops/glyph-ops.js';
export {
  adjacentOffcurves,
  cubicAt,
  flattenSegment,
  quadraticAt,
  SEGMENT_FLATTEN_STEPS,
  segmentsOf,
  splitCubicAt,
  splitQuadraticAt,
} from './ops/contour-segments.js';
export type { Segment, Vec2 } from './ops/contour-segments.js';
export { insertPoint, removePoint, movePoints, convertPointType } from './ops/contour-ops.js';
