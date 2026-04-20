import type { Glyph, Layer } from '@interrobang/core';

/**
 * Version marker for the `{ contours, components, anchors }` JSON blobs stored
 * on the `layers` table. Bump whenever the on-disk shape of any of those
 * arrays changes in a way that needs migration. Rows written at v < current
 * are migrated on read via `parseVersioned`.
 */
export const BLOB_VERSION = 1;

interface VersionedBlob<T> {
  v: number;
  data: T;
}

function parseVersioned<T>(raw: string, fallbackToBareArray: boolean): T {
  const parsed: unknown = JSON.parse(raw);
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'v' in parsed &&
    'data' in parsed
  ) {
    // v1+ wrapper
    return (parsed as VersionedBlob<T>).data;
  }
  if (fallbackToBareArray) {
    // v0: bare array (pre-versioning)
    return parsed as T;
  }
  throw new Error('unrecognized blob shape');
}

export function serializeLayer(layer: Layer): {
  contoursJson: string;
  componentsJson: string;
  anchorsJson: string;
} {
  return {
    contoursJson: JSON.stringify({ v: BLOB_VERSION, data: layer.contours }),
    componentsJson: JSON.stringify({ v: BLOB_VERSION, data: layer.components }),
    anchorsJson: JSON.stringify({ v: BLOB_VERSION, data: layer.anchors }),
  };
}

export function deserializeLayer(row: {
  id: string;
  master_id: string;
  contours_json: string;
  components_json: string;
  anchors_json: string;
}): Layer {
  return {
    id: row.id,
    masterId: row.master_id,
    contours: parseVersioned<Layer['contours']>(row.contours_json, true),
    components: parseVersioned<Layer['components']>(row.components_json, true),
    anchors: parseVersioned<Layer['anchors']>(row.anchors_json, true),
  };
}

export function serializeGlyph(g: Glyph): {
  id: string;
  name: string;
  advance_width: number;
  unicode_codepoint: number | null;
  revision: number;
} {
  return {
    id: g.id,
    name: g.name,
    advance_width: g.advanceWidth,
    unicode_codepoint: g.unicodeCodepoint,
    revision: g.revision,
  };
}
