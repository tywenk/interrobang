import type { Font, Glyph, Point, PointType, Layer } from '../index.js';
import type { Command } from './command.js';
import type { MutationTarget } from './mutation-target.js';
import { insertPoint, removePoint, movePoints, convertPointType } from '../ops/contour-ops.js';
import { updateGlyph, replaceLayer } from '../ops/glyph-ops.js';

function keyOf(t: MutationTarget): string {
  switch (t.kind) {
    case 'meta':
      return `meta:${t.projectId}`;
    case 'glyph':
      return `glyph:${t.glyphId}`;
    case 'layer':
      return `layer:${t.glyphId}:${t.layerId}`;
    case 'kerning':
      return `kerning:${t.leftGlyph}:${t.rightGlyph}`;
    case 'component':
      return `component:${t.componentId}`;
  }
}

export function unionAffects(
  a: readonly MutationTarget[],
  b: readonly MutationTarget[],
): readonly MutationTarget[] {
  const seen = new Set<string>();
  const out: MutationTarget[] = [];
  for (const t of [...a, ...b]) {
    const key = keyOf(t);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

interface ContourTarget {
  glyphId: string;
  layerId: string;
  contourId: string;
}

function withContour(
  font: Font,
  t: ContourTarget,
  fn: (c: Layer['contours'][number]) => Layer['contours'][number],
): Font {
  return updateGlyph(font, t.glyphId, (g) => {
    const layer = g.layers.find((l) => l.id === t.layerId);
    if (!layer) return g;
    const contour = layer.contours.find((c) => c.id === t.contourId);
    if (!contour) return g;
    const next = fn(contour);
    if (next === contour) return g;
    const layers = g.layers.map((l) =>
      l.id === t.layerId
        ? { ...l, contours: l.contours.map((c) => (c.id === t.contourId ? next : c)) }
        : l,
    );
    return replaceLayer(g, layers.find((l) => l.id === t.layerId)!);
  });
}

export interface MovePointsArgs extends ContourTarget {
  pointIds: readonly string[];
  dx: number;
  dy: number;
}

export function movePointsCommand(args: MovePointsArgs): Command<Font> {
  const ids = new Set(args.pointIds);
  const affects: readonly MutationTarget[] = [
    { kind: 'layer', glyphId: args.glyphId, layerId: args.layerId },
  ];
  return {
    type: 'movePoints',
    affects,
    apply: (f) => withContour(f, args, (c) => movePoints(c, ids, args.dx, args.dy)),
    revert: (f) => withContour(f, args, (c) => movePoints(c, ids, -args.dx, -args.dy)),
    canMergeWith: (other) =>
      other.type === 'movePoints' &&
      sameSet(ids, new Set((other as Command<Font> & { _ids: ReadonlySet<string> })._ids ?? [])),
    mergeWith: (other) => {
      const o = other as Command<Font> & {
        _dx: number;
        _dy: number;
        affects?: readonly MutationTarget[];
      };
      const merged = movePointsCommand({ ...args, dx: args.dx + o._dx, dy: args.dy + o._dy });
      return {
        ...merged,
        affects: unionAffects(affects, o.affects ?? []),
      } as Command<Font>;
    },
    _ids: ids,
    _dx: args.dx,
    _dy: args.dy,
  } as Command<Font> & { _ids: ReadonlySet<string>; _dx: number; _dy: number };
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export interface InsertPointArgs extends ContourTarget {
  index: number;
  point: Point;
}

export function insertPointCommand(args: InsertPointArgs): Command<Font> {
  return {
    type: 'insertPoint',
    affects: [{ kind: 'layer', glyphId: args.glyphId, layerId: args.layerId }],
    apply: (f) => withContour(f, args, (c) => insertPoint(c, args.index, args.point)),
    revert: (f) => withContour(f, args, (c) => removePoint(c, args.point.id)),
  };
}

export interface RemovePointArgs extends ContourTarget {
  pointId: string;
}

export function removePointCommand(args: RemovePointArgs): Command<Font> {
  let removed: Point | null = null;
  let removedIndex = -1;
  return {
    type: 'removePoint',
    affects: [{ kind: 'layer', glyphId: args.glyphId, layerId: args.layerId }],
    apply: (f) =>
      withContour(f, args, (c) => {
        const idx = c.points.findIndex((p) => p.id === args.pointId);
        if (idx === -1) return c;
        removed = c.points[idx]!;
        removedIndex = idx;
        return removePoint(c, args.pointId);
      }),
    revert: (f) =>
      withContour(f, args, (c) => (removed ? insertPoint(c, removedIndex, removed) : c)),
  };
}

export interface ConvertPointTypeArgs extends ContourTarget {
  pointId: string;
  newType: PointType;
}

interface AddGlyphCommandInput {
  glyph: Glyph;
}

export function addGlyphCommand(input: AddGlyphCommandInput): Command<Font> {
  const { glyph } = input;
  const affects: readonly MutationTarget[] = [
    { kind: 'glyph', glyphId: glyph.id },
    ...glyph.layers.map(
      (l): MutationTarget => ({ kind: 'layer', glyphId: glyph.id, layerId: l.id }),
    ),
  ];
  return {
    type: 'addGlyph',
    affects,
    apply(font) {
      if (font.glyphs[glyph.id]) return font;
      return {
        ...font,
        glyphs: { ...font.glyphs, [glyph.id]: glyph },
        glyphOrder: [...font.glyphOrder, glyph.id],
      };
    },
    revert(font) {
      const { [glyph.id]: _removed, ...rest } = font.glyphs;
      return {
        ...font,
        glyphs: rest,
        glyphOrder: font.glyphOrder.filter((id) => id !== glyph.id),
      };
    },
  };
}

// TODO(components): editComponentCommand, referenceComponentCommand — each
// produces a MutationTarget { kind: 'component', componentId } and fans out
// to every glyph referencing that component (see component_refs table).

export function convertPointTypeCommand(args: ConvertPointTypeArgs): Command<Font> {
  let prev: PointType | null = null;
  return {
    type: 'convertPointType',
    affects: [{ kind: 'layer', glyphId: args.glyphId, layerId: args.layerId }],
    apply: (f) =>
      withContour(f, args, (c) => {
        const p = c.points.find((q) => q.id === args.pointId);
        if (!p) return c;
        prev = p.type;
        return convertPointType(c, args.pointId, args.newType);
      }),
    revert: (f) =>
      withContour(f, args, (c) => (prev ? convertPointType(c, args.pointId, prev) : c)),
  };
}
