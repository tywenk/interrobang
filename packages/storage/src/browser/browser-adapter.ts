import { newId, type Font, type Glyph, type Layer, type MutationTarget } from '@interrobang/core';
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

/**
 * SQL row shapes, matching the column names SQLite returns (snake_case).
 * We keep Drizzle's table definitions in `@interrobang/schema` as the source
 * of truth for DDL, but consume rows through hand SQL: Drizzle's sqlite-proxy
 * works against node:sqlite in tests but throws against our wa-sqlite worker
 * at runtime, and typed reads aren't worth a second query path.
 */
interface ProjectRow {
  id: string;
  name: string;
  updated_at: number;
  revision: number;
}
interface FontMetaRow {
  project_id: string;
  family_name: string;
  style_name: string;
  units_per_em: number;
  ascender: number;
  descender: number;
  cap_height: number;
  x_height: number;
  extra_metrics_json: string | null;
}
interface MasterRow {
  id: string;
  project_id: string;
  name: string;
  weight: number;
  width: number;
}
interface GlyphRow {
  id: string;
  project_id: string;
  name: string;
  advance_width: number;
  unicode_codepoint: number | null;
  revision: number;
}
interface LayerRow {
  id: string;
  glyph_id: string;
  master_id: string;
  contours_json: string;
  components_json: string;
  anchors_json: string;
}
interface KerningRow {
  project_id: string;
  left_glyph: string;
  right_glyph: string;
  value: number;
  revision: number;
}
interface ProjectRevisionRow {
  id: string;
  revision: number;
}

async function queryRows<T>(
  client: SqliteClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows = await client.query(sql, params as never);
  return rows as unknown as T[];
}

export class BrowserStorageAdapter implements StorageAdapter {
  constructor(private db: SqliteClient) {}

  async listProjects(): Promise<ProjectSummary[]> {
    const rows = await queryRows<ProjectRow>(
      this.db,
      'SELECT id, name, updated_at, revision FROM projects ORDER BY updated_at DESC',
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updated_at,
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
    const [meta] = await queryRows<FontMetaRow>(
      this.db,
      'SELECT * FROM font_meta WHERE project_id = ?',
      [projectId],
    );
    if (!meta) throw new Error(`No project: ${projectId}`);

    const [projRow] = await queryRows<ProjectRevisionRow>(
      this.db,
      'SELECT id, revision FROM projects WHERE id = ?',
      [projectId],
    );
    if (!projRow) throw new Error(`No project row: ${projectId}`);

    const masterRows = await queryRows<MasterRow>(
      this.db,
      'SELECT * FROM masters WHERE project_id = ?',
      [projectId],
    );

    const glyphRows = await queryRows<GlyphRow>(
      this.db,
      'SELECT * FROM glyphs WHERE project_id = ?',
      [projectId],
    );

    const layerRows = await queryRows<LayerRow>(
      this.db,
      `SELECT layers.* FROM layers
       INNER JOIN glyphs ON glyphs.id = layers.glyph_id
       WHERE glyphs.project_id = ?`,
      [projectId],
    );

    const kerningRows = await queryRows<KerningRow>(
      this.db,
      'SELECT * FROM kerning_pairs WHERE project_id = ?',
      [projectId],
    );

    const layersByGlyph = new Map<string, Layer[]>();
    for (const r of layerRows) {
      const arr = layersByGlyph.get(r.glyph_id) ?? [];
      arr.push(
        deserializeLayer({
          id: r.id,
          master_id: r.master_id,
          contours_json: r.contours_json,
          components_json: r.components_json,
          anchors_json: r.anchors_json,
        }),
      );
      layersByGlyph.set(r.glyph_id, arr);
    }

    const glyphs: { [id: string]: Glyph } = {};
    const order: string[] = [];
    for (const g of glyphRows) {
      glyphs[g.id] = {
        id: g.id,
        name: g.name,
        advanceWidth: g.advance_width,
        unicodeCodepoint: g.unicode_codepoint ?? null,
        layers: layersByGlyph.get(g.id) ?? [],
        revision: g.revision,
      };
      order.push(g.id);
    }

    const extra = deserializeExtraMetrics(meta.extra_metrics_json);
    return {
      id: projRow.id,
      meta: {
        familyName: meta.family_name,
        styleName: meta.style_name,
        unitsPerEm: meta.units_per_em,
        ascender: meta.ascender,
        descender: meta.descender,
        capHeight: meta.cap_height,
        xHeight: meta.x_height,
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
        leftGlyph: k.left_glyph,
        rightGlyph: k.right_glyph,
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
