import type { Glyph, Layer } from '@interrobang/core';

export function serializeLayer(layer: Layer): {
  contoursJson: string;
  componentsJson: string;
  anchorsJson: string;
} {
  return {
    contoursJson: JSON.stringify(layer.contours),
    componentsJson: JSON.stringify(layer.components),
    anchorsJson: JSON.stringify(layer.anchors),
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
    contours: JSON.parse(row.contours_json),
    components: JSON.parse(row.components_json),
    anchors: JSON.parse(row.anchors_json),
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
