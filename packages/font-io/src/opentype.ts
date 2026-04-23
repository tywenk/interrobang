import opentype from 'opentype.js';
import { match } from 'ts-pattern';
import {
  newId,
  type Font,
  type Glyph,
  type Layer,
  type Contour,
  type Point,
} from '@interrobang/core';

/**
 * Parse an OpenType, TrueType, or OTF font into the internal {@link Font} model.
 *
 * @param bytes - Raw font binary (e.g. from `fetch().arrayBuffer()` or a file input).
 * @returns A `Font` with a single default master. Each OpenType glyph becomes
 *   a `Glyph` whose `layers[0]` holds the converted outline.
 * @throws If `opentype.js` cannot parse the input (malformed or unsupported table).
 * @example
 * ```ts
 * const bytes = await fetch('/MyFont.ttf').then((r) => r.arrayBuffer());
 * const font = parseOTF(bytes);
 * ```
 */
export function parseOTF(bytes: ArrayBuffer): Font {
  const ot = opentype.parse(bytes);
  const masterId = newId();
  const familyName = ot.names.fontFamily?.en ?? 'Untitled';
  const styleName = ot.names.fontSubfamily?.en ?? 'Regular';
  const glyphs: { [id: string]: Glyph } = {};
  const order: string[] = [];

  for (let i = 0; i < ot.glyphs.length; i++) {
    const g = ot.glyphs.get(i);
    const name = g.name || `glyph${i}`;
    const layer = pathToLayer(g.path, masterId);
    const glyphId = newId();
    glyphs[glyphId] = {
      id: glyphId,
      name,
      advanceWidth: g.advanceWidth ?? 500,
      unicodeCodepoint: g.unicode ?? null,
      layers: [layer],
      revision: 0,
    };
    order.push(glyphId);
  }

  // Harvest a few OS/2 / hhea fields into `extraMetrics` so CJK / non-Latin
  // consumers have round-trippable state for things core doesn't model. Keep
  // the bag small: we only surface fields that are plain integers.
  const os2 = ot.tables.os2 as
    | {
        sCapHeight?: number;
        sxHeight?: number;
        sTypoAscender?: number;
        sTypoDescender?: number;
        sTypoLineGap?: number;
        usWinAscent?: number;
        usWinDescent?: number;
      }
    | undefined;
  const extraMetrics = pickFiniteNumbers({
    sTypoAscender: os2?.sTypoAscender,
    sTypoDescender: os2?.sTypoDescender,
    sTypoLineGap: os2?.sTypoLineGap,
    usWinAscent: os2?.usWinAscent,
    usWinDescent: os2?.usWinDescent,
  });

  return {
    id: newId(),
    meta: {
      familyName,
      styleName,
      unitsPerEm: ot.unitsPerEm,
      ascender: ot.ascender,
      descender: ot.descender,
      capHeight: os2?.sCapHeight ?? 700,
      xHeight: os2?.sxHeight ?? 500,
      ...(extraMetrics ? { extraMetrics } : {}),
    },
    masters: [{ id: masterId, name: styleName, weight: 400, width: 100 }],
    glyphs,
    glyphOrder: order,
    kerning: [],
    revision: 0,
  };
}

/** Keep only finite-number entries; return `undefined` when the result is empty. */
function pickFiniteNumbers(
  candidates: Record<string, number | undefined>,
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(candidates)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Convert an `opentype.js` path into a {@link Layer} of typed points. */
function pathToLayer(path: opentype.Path, masterId: string): Layer {
  const contours: Contour[] = [];
  let current: Point[] = [];
  let hasMove = false;

  for (const cmd of path.commands) {
    match(cmd)
      .with({ type: 'M' }, (c) => {
        if (current.length) contours.push({ id: newId(), closed: true, points: current });
        current = [{ id: newId(), x: c.x, y: c.y, type: 'line', smooth: false }];
        hasMove = true;
      })
      .with({ type: 'L' }, (c) => {
        current.push({ id: newId(), x: c.x, y: c.y, type: 'line', smooth: false });
      })
      .with({ type: 'Q' }, (c) => {
        current.push({ id: newId(), x: c.x1, y: c.y1, type: 'offcurve', smooth: false });
        current.push({ id: newId(), x: c.x, y: c.y, type: 'qcurve', smooth: false });
      })
      .with({ type: 'C' }, (c) => {
        current.push({ id: newId(), x: c.x1, y: c.y1, type: 'offcurve', smooth: false });
        current.push({ id: newId(), x: c.x2, y: c.y2, type: 'offcurve', smooth: false });
        current.push({ id: newId(), x: c.x, y: c.y, type: 'curve', smooth: false });
      })
      .with({ type: 'Z' }, () => {
        if (current.length) {
          contours.push({ id: newId(), closed: true, points: current });
          current = [];
        }
      })
      .exhaustive();
  }
  if (current.length) contours.push({ id: newId(), closed: hasMove, points: current });

  return { id: newId(), masterId, contours, components: [], anchors: [] };
}

/**
 * Serialize a {@link Font} as an OpenType binary.
 *
 * A `.notdef` glyph is always emitted first, as required by the OpenType spec;
 * any existing `.notdef` in `font.glyphOrder` is skipped to avoid duplication.
 *
 * @param font - Font from the `@interrobang/core` model.
 * @returns ArrayBuffer containing a valid `.otf`/`.ttf` binary.
 * @remarks Only `layers[0]` is exported for each glyph — multi-master export
 *   is not yet supported.
 */
export function writeOTF(font: Font): ArrayBuffer {
  const otGlyphs: opentype.Glyph[] = [];
  // .notdef is required as the first glyph
  otGlyphs.push(
    new opentype.Glyph({
      name: '.notdef',
      unicode: 0,
      advanceWidth: font.meta.unitsPerEm / 2,
      path: new opentype.Path(),
    }),
  );
  for (const id of font.glyphOrder) {
    const g = font.glyphs[id]!;
    if (g.name === '.notdef') continue;
    otGlyphs.push(
      new opentype.Glyph({
        name: g.name,
        unicode: g.unicodeCodepoint ?? undefined,
        advanceWidth: g.advanceWidth,
        path: layerToPath(g.layers[0]!),
      }),
    );
  }
  const ot = new opentype.Font({
    familyName: font.meta.familyName,
    styleName: font.meta.styleName,
    unitsPerEm: font.meta.unitsPerEm,
    ascender: font.meta.ascender,
    descender: font.meta.descender,
    glyphs: otGlyphs,
  });
  // Stamp any round-trippable OS/2 extras back onto the generated OS/2 table.
  // opentype.js builds a default one in the constructor, so mutate it rather
  // than passing a half-formed `tables.os2`.
  const os2 = ot.tables.os2 as Record<string, number | undefined> | undefined;
  if (os2 && font.meta.extraMetrics) {
    for (const [k, v] of Object.entries(font.meta.extraMetrics)) {
      os2[k] = v;
    }
  }
  return ot.toArrayBuffer();
}

/** Convert a {@link Layer}'s contours into an `opentype.js` path. */
function layerToPath(layer: Layer): opentype.Path {
  const path = new opentype.Path();
  for (const contour of layer.contours) {
    let started = false;
    let i = 0;
    while (i < contour.points.length) {
      const p = contour.points[i]!;
      if (!started) {
        path.moveTo(p.x, p.y);
        started = true;
        i += 1;
        continue;
      }
      match(p.type)
        .with('line', () => {
          path.lineTo(p.x, p.y);
        })
        .with('qcurve', () => {
          const c = contour.points[i - 1]!;
          path.quadraticCurveTo(c.x, c.y, p.x, p.y);
        })
        .with('curve', () => {
          const c1 = contour.points[i - 2]!;
          const c2 = contour.points[i - 1]!;
          path.curveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
        })
        .with('offcurve', () => {
          // raw offcurves are consumed by the preceding curve/qcurve case
        })
        .exhaustive();
      i += 1;
    }
    if (contour.closed) path.close();
  }
  return path;
}
