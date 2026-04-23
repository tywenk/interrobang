import type { Layer } from '@interrobang/core';
import { describe, it, expect } from 'vitest';

import {
  BLOB_VERSION,
  deserializeExtraMetrics,
  deserializeLayer,
  serializeExtraMetrics,
  serializeLayer,
} from './serialize.js';

function sampleLayer(): Layer {
  return {
    id: 'L1',
    masterId: 'M1',
    contours: [
      {
        id: 'C1',
        closed: true,
        points: [
          { id: 'P1', x: 0, y: 0, type: 'line', smooth: false },
          { id: 'P2', x: 100, y: 0, type: 'line', smooth: false },
        ],
      },
    ],
    components: [],
    anchors: [],
  };
}

describe('serializeLayer / deserializeLayer', () => {
  it('round-trips a Layer with values preserved', () => {
    const layer = sampleLayer();
    const ser = serializeLayer(layer);
    const round = deserializeLayer({
      id: layer.id,
      master_id: layer.masterId,
      contours_json: ser.contoursJson,
      components_json: ser.componentsJson,
      anchors_json: ser.anchorsJson,
    });
    expect(round).toEqual(layer);
  });

  it('writes the v1 wrapper with BLOB_VERSION marker', () => {
    const layer = sampleLayer();
    const ser = serializeLayer(layer);
    const parsed = JSON.parse(ser.contoursJson);
    expect(parsed).toMatchObject({ v: BLOB_VERSION });
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data[0].id).toBe('C1');
  });

  it('deserializes a pre-v1 bare array (legacy shape)', () => {
    const contours = [
      {
        id: 'C1',
        closed: true,
        points: [{ id: 'P1', x: 5, y: 7, type: 'line', smooth: false }],
      },
    ];
    const layer = deserializeLayer({
      id: 'L1',
      master_id: 'M1',
      contours_json: JSON.stringify(contours),
      components_json: JSON.stringify([]),
      anchors_json: JSON.stringify([]),
    });
    expect(layer.contours).toEqual(contours);
    expect(layer.components).toEqual([]);
    expect(layer.anchors).toEqual([]);
  });

  it('deserializes an explicit { v: 1, data: [...] } wrapper', () => {
    const contours = [
      {
        id: 'C1',
        closed: false,
        points: [{ id: 'P1', x: 1, y: 2, type: 'line', smooth: false }],
      },
    ];
    const layer = deserializeLayer({
      id: 'L1',
      master_id: 'M1',
      contours_json: JSON.stringify({ v: 1, data: contours }),
      components_json: JSON.stringify({ v: 1, data: [] }),
      anchors_json: JSON.stringify({ v: 1, data: [] }),
    });
    expect(layer.contours).toEqual(contours);
    expect(layer.components).toEqual([]);
    expect(layer.anchors).toEqual([]);
  });
});

describe('serializeExtraMetrics / deserializeExtraMetrics', () => {
  it('returns null/undefined for empty and null inputs', () => {
    expect(serializeExtraMetrics(undefined)).toBeNull();
    expect(serializeExtraMetrics({})).toBeNull();
    expect(deserializeExtraMetrics(null)).toBeUndefined();
    expect(deserializeExtraMetrics(undefined)).toBeUndefined();
    expect(deserializeExtraMetrics('')).toBeUndefined();
  });

  it('round-trips numeric entries', () => {
    const src = { sTypoLineGap: 90, usWinAscent: 1400 };
    const json = serializeExtraMetrics(src);
    expect(typeof json).toBe('string');
    expect(deserializeExtraMetrics(json)).toEqual(src);
  });

  it('drops non-finite and non-number values on parse', () => {
    const json = JSON.stringify({ good: 12, bad: 'nope', nan: null });
    expect(deserializeExtraMetrics(json)).toEqual({ good: 12 });
  });
});
