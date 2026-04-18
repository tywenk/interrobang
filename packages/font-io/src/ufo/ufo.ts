import { newId, type Font, type Glyph, type Layer } from '@interrobang/core';
import { parsePlist, writePlist, type PlistValue } from './plist.js';
import { parseGlif, writeGlif } from './glif.js';

const TEXT = new TextEncoder();
const FROM_TEXT = new TextDecoder();

export function fontToUfo(font: Font): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set(
    'metainfo.plist',
    TEXT.encode(
      writePlist({
        creator: 'app.interrobang',
        formatVersion: 3,
      }),
    ),
  );
  files.set(
    'fontinfo.plist',
    TEXT.encode(
      writePlist({
        familyName: font.meta.familyName,
        styleName: font.meta.styleName,
        unitsPerEm: font.meta.unitsPerEm,
        ascender: font.meta.ascender,
        descender: font.meta.descender,
        capHeight: font.meta.capHeight,
        xHeight: font.meta.xHeight,
      }),
    ),
  );
  files.set(
    'layercontents.plist',
    TEXT.encode(writePlist([['public.default', 'glyphs']])),
  );
  const contents: Record<string, string> = {};
  for (const id of font.glyphOrder) {
    const g = font.glyphs[id]!;
    const filename = glifFilename(g.name);
    contents[g.name] = filename;
    files.set(
      `glyphs/${filename}`,
      TEXT.encode(
        writeGlif({
          name: g.name,
          advanceWidth: g.advanceWidth,
          unicodeCodepoint: g.unicodeCodepoint,
          contours: [...(g.layers[0]?.contours ?? [])],
        }),
      ),
    );
  }
  files.set('glyphs/contents.plist', TEXT.encode(writePlist(contents)));
  return files;
}

export function ufoToFont(files: Map<string, Uint8Array>): Font {
  const fontinfo = parsePlist(FROM_TEXT.decode(getRequired(files, 'fontinfo.plist'))) as Record<
    string,
    number | string
  >;
  const masterId = newId();
  const layerContentsRaw = files.get('layercontents.plist');
  const layerDir = resolveLayerDir(layerContentsRaw);
  const contentsRaw = files.get(`${layerDir}/contents.plist`);
  const contents = contentsRaw
    ? (parsePlist(FROM_TEXT.decode(contentsRaw)) as Record<string, string>)
    : {};
  const glyphs: { [id: string]: Glyph } = {};
  const order: string[] = [];
  for (const [name, filename] of Object.entries(contents)) {
    const raw = files.get(`${layerDir}/${filename}`);
    if (!raw) continue;
    const glif = parseGlif(FROM_TEXT.decode(raw));
    const layer: Layer = {
      id: newId(),
      masterId,
      contours: glif.contours,
      components: [],
      anchors: [],
    };
    const id = newId();
    glyphs[id] = {
      id,
      name,
      advanceWidth: glif.advanceWidth,
      unicodeCodepoint: glif.unicodeCodepoint,
      layers: [layer],
      revision: 0,
    };
    order.push(id);
  }
  return {
    id: newId(),
    meta: {
      familyName: String(fontinfo.familyName ?? 'Untitled'),
      styleName: String(fontinfo.styleName ?? 'Regular'),
      unitsPerEm: Number(fontinfo.unitsPerEm ?? 1000),
      ascender: Number(fontinfo.ascender ?? 800),
      descender: Number(fontinfo.descender ?? -200),
      capHeight: Number(fontinfo.capHeight ?? 700),
      xHeight: Number(fontinfo.xHeight ?? 500),
    },
    masters: [{ id: masterId, name: String(fontinfo.styleName ?? 'Regular'), weight: 400, width: 100 }],
    glyphs,
    glyphOrder: order,
    kerning: [],
    revision: 0,
  };
}

function resolveLayerDir(layerContentsRaw: Uint8Array | undefined): string {
  if (!layerContentsRaw) return 'glyphs';
  const v = parsePlist(FROM_TEXT.decode(layerContentsRaw)) as PlistValue;
  // layercontents.plist is an array of [layerName, directory] pairs.
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0];
    if (Array.isArray(first) && typeof first[1] === 'string') {
      return first[1];
    }
  }
  return 'glyphs';
}

function getRequired(files: Map<string, Uint8Array>, path: string): Uint8Array {
  const v = files.get(path);
  if (!v) throw new Error(`Missing required UFO file: ${path}`);
  return v;
}

// UFO names uppercase letters with a trailing underscore: A -> A_.glif
function glifFilename(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `${c}_`) + '.glif';
}
