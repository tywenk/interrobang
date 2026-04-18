import { test, expect } from 'bun:test';
import { parsePlist, writePlist } from './plist.js';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>familyName</key><string>MyFont</string>
    <key>unitsPerEm</key><integer>1000</integer>
    <key>ascender</key><real>800.5</real>
    <key>italic</key><false/>
  </dict>
</plist>`;

test('parsePlist parses dict, string, integer, real, false', () => {
  const v = parsePlist(SAMPLE) as Record<string, unknown>;
  expect(v.familyName).toBe('MyFont');
  expect(v.unitsPerEm).toBe(1000);
  expect(v.ascender).toBe(800.5);
  expect(v.italic).toBe(false);
});

test('writePlist round-trips', () => {
  const v = parsePlist(SAMPLE);
  const out = writePlist(v);
  const v2 = parsePlist(out);
  expect(v2).toEqual(v);
});
