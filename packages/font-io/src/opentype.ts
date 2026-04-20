import opentype from 'opentype.js';
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

  return {
    id: newId(),
    meta: {
      familyName,
      styleName,
      unitsPerEm: ot.unitsPerEm,
      ascender: ot.ascender,
      descender: ot.descender,
      capHeight: (ot.tables.os2 as { sCapHeight?: number } | undefined)?.sCapHeight ?? 700,
      xHeight: (ot.tables.os2 as { sxHeight?: number } | undefined)?.sxHeight ?? 500,
    },
    masters: [{ id: masterId, name: styleName, weight: 400, width: 100 }],
    glyphs,
    glyphOrder: order,
    kerning: [],
    revision: 0,
  };
}

/** Convert an `opentype.js` path into a {@link Layer} of typed points. */
function pathToLayer(path: opentype.Path, masterId: string): Layer {
  const contours: Contour[] = [];
  let current: Point[] = [];
  let hasMove = false;

  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      if (current.length) contours.push({ id: newId(), closed: true, points: current });
      current = [{ id: newId(), x: cmd.x, y: cmd.y, type: 'line', smooth: false }];
      hasMove = true;
    } else if (cmd.type === 'L') {
      current.push({ id: newId(), x: cmd.x, y: cmd.y, type: 'line', smooth: false });
    } else if (cmd.type === 'Q') {
      current.push({ id: newId(), x: cmd.x1, y: cmd.y1, type: 'offcurve', smooth: false });
      current.push({ id: newId(), x: cmd.x, y: cmd.y, type: 'qcurve', smooth: false });
    } else if (cmd.type === 'C') {
      current.push({ id: newId(), x: cmd.x1, y: cmd.y1, type: 'offcurve', smooth: false });
      current.push({ id: newId(), x: cmd.x2, y: cmd.y2, type: 'offcurve', smooth: false });
      current.push({ id: newId(), x: cmd.x, y: cmd.y, type: 'curve', smooth: false });
    } else if (cmd.type === 'Z') {
      if (current.length) {
        contours.push({ id: newId(), closed: true, points: current });
        current = [];
      }
    }
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
      if (p.type === 'line') {
        path.lineTo(p.x, p.y);
        i += 1;
      } else if (p.type === 'qcurve') {
        const c = contour.points[i - 1]!;
        path.quadraticCurveTo(c.x, c.y, p.x, p.y);
        i += 1;
      } else if (p.type === 'curve') {
        const c1 = contour.points[i - 2]!;
        const c2 = contour.points[i - 1]!;
        path.curveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
        i += 1;
      } else {
        i += 1; // skip raw offcurves; handled above
      }
    }
    if (contour.closed) path.close();
  }
  return path;
}
