import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { newId } from '@interrobang/core';
import type { Font } from '@interrobang/core';
import { getClientDDL } from '@interrobang/schema';
import { BrowserStorageAdapter } from './browser-adapter.js';
import type { SqliteClient } from '../worker/client.js';

// node:sqlite is an experimental builtin — vite's resolver doesn't know about
// it yet, so we load it through createRequire to skip the vite pipeline.
const require = createRequire(import.meta.url);
interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number | bigint };
  };
}
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

// In-process shim implementing the subset of SqliteClient that
// BrowserStorageAdapter uses. Lets us exercise the adapter without
// the web worker / wa-sqlite stack.
class NodeSqliteClient {
  constructor(private db: DatabaseSync) {}
  query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
    this.db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
  mutate = async (sql: string, params: unknown[] = []): Promise<number> => {
    const info = this.db.prepare(sql).run(...(params as never[]));
    return Number(info.changes);
  };
  exec = async (sql: string): Promise<void> => {
    this.db.exec(sql);
  };
}

function makeAdapter(): { adapter: BrowserStorageAdapter; db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  // node:sqlite enables foreign_keys by default, but wa-sqlite (and classic
  // SQLite) start with it OFF. Force it off so the adapter does not depend on
  // cascade to clean up layer rows.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(getClientDDL());
  const client = new NodeSqliteClient(db) as unknown as SqliteClient;
  return { adapter: new BrowserStorageAdapter(client), db };
}

function fontWithGlyphs(projectId: string, masterId: string, glyphIds: string[]): Font {
  return {
    id: projectId,
    meta: {
      familyName: 'Test',
      styleName: 'Regular',
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      capHeight: 700,
      xHeight: 500,
    },
    masters: [{ id: masterId, name: 'Regular', weight: 400, width: 100 }],
    glyphs: Object.fromEntries(
      glyphIds.map((id, i) => [
        id,
        {
          id,
          name: `g${i}`,
          advanceWidth: 500,
          unicodeCodepoint: 65 + i,
          revision: 0,
          layers: [
            {
              id: `${id}-L0`,
              masterId,
              components: [],
              anchors: [],
              contours: [
                {
                  id: `${id}-C0`,
                  closed: true,
                  points: [
                    { id: `${id}-P0`, x: 0, y: 0, type: 'line', smooth: false },
                    { id: `${id}-P1`, x: 100, y: 0, type: 'line', smooth: false },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    ),
    glyphOrder: glyphIds,
    kerning: [],
    revision: 0,
  };
}

describe('BrowserStorageAdapter', () => {
  it('saves and reloads a font with one glyph', async () => {
    const { adapter } = makeAdapter();
    const projectId = await adapter.createProject('Test');
    const font = await adapter.loadFont(projectId);
    const masterId = font.masters[0]!.id;
    const g1 = newId();
    await adapter.saveFont(projectId, fontWithGlyphs(projectId, masterId, [g1]));
    const loaded = await adapter.loadFont(projectId);
    expect(loaded.glyphOrder).toEqual([g1]);
    expect(loaded.glyphs[g1]?.layers[0]?.contours[0]?.points).toHaveLength(2);
  });

  it('persists subsequent saves (regression: layers not cascading)', async () => {
    const { adapter } = makeAdapter();
    const projectId = await adapter.createProject('Test');
    const font0 = await adapter.loadFont(projectId);
    const masterId = font0.masters[0]!.id;
    const g1 = newId();
    const g2 = newId();
    await adapter.saveFont(projectId, fontWithGlyphs(projectId, masterId, [g1]));
    await adapter.saveFont(projectId, fontWithGlyphs(projectId, masterId, [g1, g2]));
    const loaded = await adapter.loadFont(projectId);
    expect(new Set(loaded.glyphOrder)).toEqual(new Set([g1, g2]));
    expect(loaded.glyphs[g1]?.layers).toHaveLength(1);
    expect(loaded.glyphs[g2]?.layers).toHaveLength(1);
  });

  it('persists edits to an existing glyph across saves', async () => {
    const { adapter } = makeAdapter();
    const projectId = await adapter.createProject('Test');
    const font0 = await adapter.loadFont(projectId);
    const masterId = font0.masters[0]!.id;
    const g1 = newId();
    await adapter.saveFont(projectId, fontWithGlyphs(projectId, masterId, [g1]));
    const edited = fontWithGlyphs(projectId, masterId, [g1]);
    const editedGlyph = {
      ...edited.glyphs[g1]!,
      layers: [
        {
          ...edited.glyphs[g1]!.layers[0]!,
          contours: [
            {
              ...edited.glyphs[g1]!.layers[0]!.contours[0]!,
              points: [
                { id: `${g1}-P0`, x: 42, y: 99, type: 'line' as const, smooth: false },
              ],
            },
          ],
        },
      ],
    };
    await adapter.saveFont(projectId, { ...edited, glyphs: { [g1]: editedGlyph } });
    const loaded = await adapter.loadFont(projectId);
    const pt = loaded.glyphs[g1]?.layers[0]?.contours[0]?.points[0];
    expect(pt?.x).toBe(42);
    expect(pt?.y).toBe(99);
  });
});
