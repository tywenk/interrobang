import { XMLParser } from 'fast-xml-parser';
import { newId, type Contour, type Point, type PointType } from '@interrobang/core';

/**
 * The subset of GLIF 2 data that this package reads and writes.
 *
 * Advances, components, anchors, images, and lib data are not currently
 * carried through.
 *
 * @see https://unifiedfontobject.org/versions/ufo3/glyphs/glif/
 */
export interface GlifGlyph {
  /** Glyph name (the `name` attribute on the root `<glyph>` element). */
  name: string;
  /** Horizontal advance width in font units. Defaults to 500 when absent. */
  advanceWidth: number;
  /** First `<unicode>` hex value as a codepoint, or `null` if the glyph has no codepoint. */
  unicodeCodepoint: number | null;
  /** Contours in the `<outline>` element. */
  contours: Contour[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

interface GlifTree {
  '@_name'?: string;
  advance?: { '@_width'?: string };
  unicode?: { '@_hex'?: string };
  outline?: { contour?: GlifContourTree | GlifContourTree[] };
}
interface GlifContourTree {
  point?: GlifPointTree | GlifPointTree[];
}
interface GlifPointTree {
  '@_x'?: string;
  '@_y'?: string;
  '@_type'?: string;
  '@_smooth'?: string;
}

/**
 * Parse a GLIF 2 XML document into a {@link GlifGlyph}.
 *
 * @param xml - Full GLIF source, including the XML declaration.
 * @returns Parsed glyph.
 * @see https://unifiedfontobject.org/versions/ufo3/glyphs/glif/
 */
export function parseGlif(xml: string): GlifGlyph {
  const tree = parser.parse(xml) as { glyph: GlifTree };
  const g = tree.glyph;
  const advanceWidth = g.advance?.['@_width'] !== undefined ? Number(g.advance['@_width']) : 500;
  const unicode = g.unicode?.['@_hex'] !== undefined ? parseInt(g.unicode['@_hex'], 16) : null;
  const rawContours = g.outline?.contour;
  const contoursArr = rawContours === undefined ? [] : Array.isArray(rawContours) ? rawContours : [rawContours];
  const contours: Contour[] = contoursArr.map((c) => {
    const rawPoints = c.point;
    const pts = rawPoints === undefined ? [] : Array.isArray(rawPoints) ? rawPoints : [rawPoints];
    const points: Point[] = pts.map((p) => ({
      id: newId(),
      x: Number(p['@_x']),
      y: Number(p['@_y']),
      type: (p['@_type'] as PointType | undefined) ?? 'offcurve',
      smooth: p['@_smooth'] === 'yes',
    }));
    return { id: newId(), closed: true, points } satisfies Contour;
  });
  return {
    name: g['@_name'] ?? '',
    advanceWidth,
    unicodeCodepoint: unicode,
    contours,
  };
}

/**
 * Serialize a {@link GlifGlyph} as GLIF 2 XML (`format="2"`).
 *
 * The output is deterministic and tab-indented. `type="offcurve"` is omitted
 * on points (the GLIF default), and `smooth="yes"` is only emitted when true.
 *
 * @param g - Glyph to serialize.
 * @returns GLIF XML source ending in a trailing newline.
 */
export function writeGlif(g: GlifGlyph): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<glyph name="${escapeXml(g.name)}" format="2">`);
  lines.push(`\t<advance width="${g.advanceWidth}"/>`);
  if (g.unicodeCodepoint !== null) {
    const hex = g.unicodeCodepoint.toString(16).toUpperCase().padStart(4, '0');
    lines.push(`\t<unicode hex="${hex}"/>`);
  }
  if (g.contours.length === 0) {
    lines.push('\t<outline/>');
  } else {
    lines.push('\t<outline>');
    for (const c of g.contours) {
      if (c.points.length === 0) {
        lines.push('\t\t<contour/>');
        continue;
      }
      lines.push('\t\t<contour>');
      for (const p of c.points) {
        const attrs: string[] = [`x="${p.x}"`, `y="${p.y}"`];
        if (p.type !== 'offcurve') attrs.push(`type="${p.type}"`);
        if (p.smooth) attrs.push('smooth="yes"');
        lines.push(`\t\t\t<point ${attrs.join(' ')}/>`);
      }
      lines.push('\t\t</contour>');
    }
    lines.push('\t</outline>');
  }
  lines.push('</glyph>');
  return lines.join('\n') + '\n';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
