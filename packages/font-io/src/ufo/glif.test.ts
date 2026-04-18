import { test, expect } from 'vitest';
import { parseGlif, writeGlif } from './glif.js';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="A" format="2">
  <advance width="500"/>
  <unicode hex="0041"/>
  <outline>
    <contour>
      <point x="100" y="0" type="line"/>
      <point x="400" y="0" type="line"/>
      <point x="250" y="700" type="line"/>
    </contour>
  </outline>
</glyph>`;

test('parseGlif extracts name, advance, unicode, contours', () => {
  const g = parseGlif(SAMPLE);
  expect(g.name).toBe('A');
  expect(g.advanceWidth).toBe(500);
  expect(g.unicodeCodepoint).toBe(0x41);
  expect(g.contours).toHaveLength(1);
  expect(g.contours[0]!.points).toHaveLength(3);
});

test('writeGlif round-trips structurally', () => {
  const g = parseGlif(SAMPLE);
  const out = writeGlif(g);
  const g2 = parseGlif(out);
  expect(g2.name).toBe(g.name);
  expect(g2.advanceWidth).toBe(g.advanceWidth);
  expect(g2.unicodeCodepoint).toBe(g.unicodeCodepoint);
  // IDs are regenerated on parse, so compare the structural fields only.
  const strip = (p: { x: number; y: number; type: string; smooth: boolean }) => ({
    x: p.x,
    y: p.y,
    type: p.type,
    smooth: p.smooth,
  });
  expect(g2.contours[0]!.points.map(strip)).toEqual(g.contours[0]!.points.map(strip));
});
