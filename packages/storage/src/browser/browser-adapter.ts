import { newId, type Font, type Glyph, type Layer } from '@interrobang/core';
import type { SqliteClient } from '../worker/client.js';
import type { ProjectSummary, StorageAdapter } from '../adapter.js';
import { deserializeLayer, serializeGlyph, serializeLayer } from './serialize.js';

export class BrowserStorageAdapter implements StorageAdapter {
  constructor(private db: SqliteClient) {}

  async listProjects(): Promise<ProjectSummary[]> {
    const rows = await this.db.query(
      'SELECT id, name, updated_at, revision FROM projects ORDER BY updated_at DESC',
    );
    return rows.map((r) => ({
      id: r['id'] as string,
      name: r['name'] as string,
      updatedAt: r['updated_at'] as number,
      revision: r['revision'] as number,
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
      `INSERT INTO font_meta(project_id, family_name, style_name, units_per_em, ascender, descender, cap_height, x_height)
       VALUES (?, ?, 'Regular', 1000, 800, -200, 700, 500)`,
      [id, name],
    );
    return id;
  }

  async loadFont(projectId: string): Promise<Font> {
    const metaRows = await this.db.query(
      'SELECT * FROM font_meta WHERE project_id = ?',
      [projectId],
    );
    const meta = metaRows[0];
    if (!meta) throw new Error(`No project: ${projectId}`);

    const masterRows = await this.db.query('SELECT * FROM masters WHERE project_id = ?', [
      projectId,
    ]);
    const glyphRows = await this.db.query('SELECT * FROM glyphs WHERE project_id = ?', [
      projectId,
    ]);
    const layerRows = await this.db.query(
      `SELECT layers.* FROM layers
       INNER JOIN glyphs ON glyphs.id = layers.glyph_id
       WHERE glyphs.project_id = ?`,
      [projectId],
    );
    const kerningRows = await this.db.query(
      'SELECT * FROM kerning_pairs WHERE project_id = ?',
      [projectId],
    );

    const layersByGlyph = new Map<string, Layer[]>();
    for (const r of layerRows) {
      const glyphId = r['glyph_id'] as string;
      const arr = layersByGlyph.get(glyphId) ?? [];
      arr.push(
        deserializeLayer({
          id: r['id'] as string,
          master_id: r['master_id'] as string,
          contours_json: r['contours_json'] as string,
          components_json: r['components_json'] as string,
          anchors_json: r['anchors_json'] as string,
        }),
      );
      layersByGlyph.set(glyphId, arr);
    }

    const projRows = await this.db.query('SELECT id, revision FROM projects WHERE id = ?', [
      projectId,
    ]);
    const projRow = projRows[0];
    if (!projRow) throw new Error(`No project row: ${projectId}`);

    const glyphs: { [id: string]: Glyph } = {};
    const order: string[] = [];
    for (const g of glyphRows) {
      const id = g['id'] as string;
      glyphs[id] = {
        id,
        name: g['name'] as string,
        advanceWidth: g['advance_width'] as number,
        unicodeCodepoint: (g['unicode_codepoint'] as number | null) ?? null,
        layers: layersByGlyph.get(id) ?? [],
        revision: g['revision'] as number,
      };
      order.push(id);
    }

    return {
      id: projRow['id'] as string,
      meta: {
        familyName: meta['family_name'] as string,
        styleName: meta['style_name'] as string,
        unitsPerEm: meta['units_per_em'] as number,
        ascender: meta['ascender'] as number,
        descender: meta['descender'] as number,
        capHeight: meta['cap_height'] as number,
        xHeight: meta['x_height'] as number,
      },
      masters: masterRows.map((m) => ({
        id: m['id'] as string,
        name: m['name'] as string,
        weight: m['weight'] as number,
        width: m['width'] as number,
      })),
      glyphs,
      glyphOrder: order,
      kerning: kerningRows.map((k) => ({
        leftGlyph: k['left_glyph'] as string,
        rightGlyph: k['right_glyph'] as string,
        value: k['value'] as number,
      })),
      revision: projRow['revision'] as number,
    };
  }

  async saveFont(projectId: string, font: Font): Promise<void> {
    await this.db.exec('BEGIN');
    try {
      await this.db.mutate(
        `UPDATE font_meta SET family_name=?, style_name=?, units_per_em=?, ascender=?, descender=?,
                              cap_height=?, x_height=? WHERE project_id=?`,
        [
          font.meta.familyName,
          font.meta.styleName,
          font.meta.unitsPerEm,
          font.meta.ascender,
          font.meta.descender,
          font.meta.capHeight,
          font.meta.xHeight,
          projectId,
        ],
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
