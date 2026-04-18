import { XMLParser } from 'fast-xml-parser';
import { newId, type Contour, type Point, type PointType } from '@interrobang/core';

export interface GlifGlyph {
  name: string;
  advanceWidth: number;
  unicodeCodepoint: number | null;
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
