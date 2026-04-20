import { newId, type Font, type Glyph, type Layer, type MutationTarget } from '@interrobang/core';
import { tables } from '@interrobang/schema';
import { eq, desc } from 'drizzle-orm';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import type { SqliteClient } from '../worker/client.js';
import type { ProjectSummary, StorageAdapter } from '../adapter.js';
import { applyMutation } from './apply-mutation.js';
import {
  deserializeExtraMetrics,
  deserializeLayer,
  serializeExtraMetrics,
  serializeGlyph,
  serializeLayer,
} from './serialize.js';

const schema = tables;
type DrizzleDb = SqliteRemoteDatabase<typeof schema>;

/**
 * Build a Drizzle async proxy database backed by our `SqliteClient`. Used for
 * read paths only; writes stay on hand SQL until Drizzle's browser support
 * stabilizes. The proxy's result mapper indexes rows by column position, so
 * we feed it `Object.values(row)` from the column-ordered objects our
 * worker returns.
 */
function makeDrizzle(client: SqliteClient): DrizzleDb {
  return drizzle(
    async (sql, params, method) => {
      if (method === 'run') {
        await client.mutate(sql, params as unknown[] as never);
        return { rows: [] };
      }
      const rows = await client.query(sql, params as unknown[] as never);
      if (method === 'get') {
        const first = rows[0];
        return { rows: first ? Object.values(first) : [] };
      }
      // all, values
      return { rows: rows.map((r) => Object.values(r)) };
    },
    { schema },
  );
}

export class BrowserStorageAdapter implements StorageAdapter {
  private readonly orm: DrizzleDb;

  constructor(private db: SqliteClient) {
    this.orm = makeDrizzle(db);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const rows = await this.orm
      .select({
        id: tables.projects.id,
        name: tables.projects.name,
        updatedAt: tables.projects.updatedAt,
        revision: tables.projects.revision,
      })
      .from(tables.projects)
      .orderBy(desc(tables.projects.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updatedAt,
      revision: r.revision,
    }));
  }

  async createProject(name: string): Promise<string> {
    const id = newId();
    const now = Date.now();
    await this.db.mutate(
      'INSERT INTO projects(id, name, created_at, updated_at, revision) VALUES (?, ?, ?, ?, 0)',
      [id, name, now, now],
    );
    const masterId = newId();
    await this.db.mutate(
      'INSERT INTO masters(id, project_id, name, weight, width) VALUES (?, ?, ?, 400, 100)',
      [masterId, id, 'Regular'],
    );
    await this.db.mutate(
      `INSERT INTO font_meta(project_id, family_name, style_name, units_per_em, ascender, descender, cap_height, x_height, extra_metrics_json)
       VALUES (?, ?, 'Regular', 1000, 800, -200, 700, 500, NULL)`,
      [id, name],
    );
    return id;
  }

  async loadFont(projectId: string): Promise<Font> {
    const [meta] = await this.orm
      .select()
      .from(tables.fontMeta)
      .where(eq(tables.fontMeta.projectId, projectId));
    if (!meta) throw new Error(`No project: ${projectId}`);

    const [projRow] = await this.orm
      .select({ id: tables.projects.id, revision: tables.projects.revision })
      .from(tables.projects)
      .where(eq(tables.projects.id, projectId));
    if (!projRow) throw new Error(`No project row: ${projectId}`);

    const masterRows = await this.orm
      .select()
      .from(tables.masters)
      .where(eq(tables.masters.projectId, projectId));

    const glyphRows = await this.orm
      .select()
      .from(tables.glyphs)
      .where(eq(tables.glyphs.projectId, projectId));

    const layerRows = await this.orm
      .select({
        id: tables.layers.id,
        glyphId: tables.layers.glyphId,
        masterId: tables.layers.masterId,
        contoursJson: tables.layers.contoursJson,
        componentsJson: tables.layers.componentsJson,
        anchorsJson: tables.layers.anchorsJson,
      })
      .from(tables.layers)
      .innerJoin(tables.glyphs, eq(tables.glyphs.id, tables.layers.glyphId))
      .where(eq(tables.glyphs.projectId, projectId));

    const kerningRows = await this.orm
      .select()
      .from(tables.kerningPairs)
      .where(eq(tables.kerningPairs.projectId, projectId));

    const layersByGlyph = new Map<string, Layer[]>();
    for (const r of layerRows) {
      const arr = layersByGlyph.get(r.glyphId) ?? [];
      arr.push(
        deserializeLayer({
          id: r.id,
          master_id: r.masterId,
          contours_json: r.contoursJson,
          components_json: r.componentsJson,
          anchors_json: r.anchorsJson,
        }),
      );
      layersByGlyph.set(r.glyphId, arr);
    }

    const glyphs: { [id: string]: Glyph } = {};
    const order: string[] = [];
    for (const g of glyphRows) {
      glyphs[g.id] = {
        id: g.id,
        name: g.name,
        advanceWidth: g.advanceWidth,
        unicodeCodepoint: g.unicodeCodepoint ?? null,
        layers: layersByGlyph.get(g.id) ?? [],
        revision: g.revision,
      };
      order.push(g.id);
    }

    const extra = deserializeExtraMetrics(meta.extraMetricsJson);
    return {
      id: projRow.id,
      meta: {
        familyName: meta.familyName,
        styleName: meta.styleName,
        unitsPerEm: meta.unitsPerEm,
        ascender: meta.ascender,
        descender: meta.descender,
        capHeight: meta.capHeight,
        xHeight: meta.xHeight,
        ...(extra ? { extraMetrics: extra } : {}),
      },
      masters: masterRows.map((m) => ({
        id: m.id,
        name: m.name,
        weight: m.weight,
        width: m.width,
      })),
      glyphs,
      glyphOrder: order,
      kerning: kerningRows.map((k) => ({
        leftGlyph: k.leftGlyph,
        rightGlyph: k.rightGlyph,
        value: k.value,
      })),
      revision: projRow.revision,
    };
  }

  /**
   * Full-font upsert. Used by import flows (`ImportButton`) to land a freshly
   * parsed OTF/UFO into SQLite in one shot. All interactive edits go through
   * `applyMutation` instead.
   */
  async saveFont(projectId: string, font: Font): Promise<void> {
    await this.db.exec('BEGIN');
    try {
      await this.db.mutate(
        `UPDATE font_meta SET family_name=?, style_name=?, units_per_em=?, ascender=?, descender=?,
                              cap_height=?, x_height=?, extra_metrics_json=? WHERE project_id=?`,
        [
          font.meta.familyName,
          font.meta.styleName,
          font.meta.unitsPerEm,
          font.meta.ascender,
          font.meta.descender,
          font.meta.capHeight,
          font.meta.xHeight,
          serializeExtraMetrics(font.meta.extraMetrics),
          projectId,
        ],
      );

      // Layers have a FK to glyphs with ON DELETE CASCADE, but SQLite's
      // foreign_keys pragma is off by default, so we delete them explicitly
      // to avoid primary-key collisions when re-inserting the same layer ids.
      await this.db.mutate(
        'DELETE FROM layers WHERE glyph_id IN (SELECT id FROM glyphs WHERE project_id = ?)',
        [projectId],
      );
      await this.db.mutate('DELETE FROM glyphs WHERE project_id = ?', [projectId]);

      for (const id of font.glyphOrder) {
        const g = font.glyphs[id];
        if (!g) continue;
        const row = serializeGlyph(g);
        await this.db.mutate(
          `INSERT INTO glyphs(id, project_id, name, advance_width, unicode_codepoint, revision)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [row.id, projectId, row.name, row.advance_width, row.unicode_codepoint, row.revision],
        );
        for (const layer of g.layers) {
          const ser = serializeLayer(layer);
          await this.db.mutate(
            `INSERT INTO layers(id, glyph_id, master_id, contours_json, components_json, anchors_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [layer.id, g.id, layer.masterId, ser.contoursJson, ser.componentsJson, ser.anchorsJson],
          );
        }
      }

      await this.db.mutate('DELETE FROM kerning_pairs WHERE project_id = ?', [projectId]);
      for (const k of font.kerning) {
        await this.db.mutate(
          `INSERT INTO kerning_pairs(project_id, left_glyph, right_glyph, value, revision)
           VALUES (?, ?, ?, ?, 0)`,
          [projectId, k.leftGlyph, k.rightGlyph, k.value],
        );
      }

      await this.db.mutate('UPDATE projects SET updated_at=?, revision=? WHERE id=?', [
        Date.now(),
        font.revision,
        projectId,
      ]);
      await this.db.exec('COMMIT');
    } catch (err) {
      await this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async applyMutation(projectId: string, target: MutationTarget, font: Font): Promise<void> {
    return applyMutation(this.db, projectId, target, font);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.db.mutate('DELETE FROM projects WHERE id = ?', [projectId]);
  }

  async readBlob(projectId: string, key: string): Promise<Uint8Array | null> {
    const rows = await this.db.query(
      'SELECT bytes FROM project_blobs WHERE project_id = ? AND key = ?',
      [projectId, key],
    );
    const row = rows[0];
    if (!row) return null;
    const bytes = row['bytes'];
    return bytes instanceof Uint8Array ? bytes : null;
  }

  async writeBlob(projectId: string, key: string, bytes: Uint8Array): Promise<void> {
    await this.db.mutate(
      `INSERT INTO project_blobs(project_id, key, bytes) VALUES (?, ?, ?)
       ON CONFLICT(project_id, key) DO UPDATE SET bytes = excluded.bytes`,
      [projectId, key, bytes],
    );
  }
}
