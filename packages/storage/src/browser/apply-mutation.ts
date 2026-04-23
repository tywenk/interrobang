import type { Font, MutationTarget } from '@interrobang/core';

import type { SqliteClient } from '../worker/client.js';
import { serializeExtraMetrics, serializeGlyph, serializeLayer } from './serialize.js';

export async function applyMutation(
  db: SqliteClient,
  projectId: string,
  target: MutationTarget,
  font: Font,
): Promise<void> {
  await db.exec('BEGIN');
  try {
    await applyOne(db, projectId, target, font);
    await db.mutate('UPDATE projects SET updated_at=?, revision=? WHERE id=?', [
      Date.now(),
      font.revision,
      projectId,
    ]);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

async function applyOne(
  db: SqliteClient,
  projectId: string,
  target: MutationTarget,
  font: Font,
): Promise<void> {
  switch (target.kind) {
    case 'meta':
      await db.mutate(
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
      return;

    case 'glyph': {
      const glyph = font.glyphs[target.glyphId];
      if (!glyph) {
        // Glyph removed — cascade layers first (foreign_keys pragma is off in
        // wa-sqlite), then delete the glyph row.
        await db.mutate('DELETE FROM layers WHERE glyph_id = ?', [target.glyphId]);
        await db.mutate('DELETE FROM glyphs WHERE id = ? AND project_id = ?', [
          target.glyphId,
          projectId,
        ]);
        return;
      }
      const row = serializeGlyph(glyph);
      await db.mutate(
        `INSERT INTO glyphs(id, project_id, name, advance_width, unicode_codepoint, revision)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           advance_width = excluded.advance_width,
           unicode_codepoint = excluded.unicode_codepoint,
           revision = excluded.revision`,
        [row.id, projectId, row.name, row.advance_width, row.unicode_codepoint, row.revision],
      );
      // Fan out to this glyph's layers so a { kind: 'glyph' } target alone is
      // self-contained (matches addGlyphCommand.affects which also lists each
      // layer separately — but callers that only send the glyph target still
      // leave the DB consistent).
      await db.mutate('DELETE FROM layers WHERE glyph_id = ?', [target.glyphId]);
      for (const layer of glyph.layers) {
        const ser = serializeLayer(layer);
        await db.mutate(
          `INSERT INTO layers(id, glyph_id, master_id, contours_json, components_json, anchors_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            layer.id,
            glyph.id,
            layer.masterId,
            ser.contoursJson,
            ser.componentsJson,
            ser.anchorsJson,
          ],
        );
      }
      return;
    }

    case 'layer': {
      const glyph = font.glyphs[target.glyphId];
      const layer = glyph?.layers.find((l) => l.id === target.layerId);
      if (!layer) {
        await db.mutate('DELETE FROM layers WHERE id = ? AND glyph_id = ?', [
          target.layerId,
          target.glyphId,
        ]);
        return;
      }
      const ser = serializeLayer(layer);
      await db.mutate(
        `INSERT INTO layers(id, glyph_id, master_id, contours_json, components_json, anchors_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           master_id = excluded.master_id,
           contours_json = excluded.contours_json,
           components_json = excluded.components_json,
           anchors_json = excluded.anchors_json`,
        [
          layer.id,
          target.glyphId,
          layer.masterId,
          ser.contoursJson,
          ser.componentsJson,
          ser.anchorsJson,
        ],
      );
      return;
    }

    case 'kerning': {
      const pair = font.kerning.find(
        (k) => k.leftGlyph === target.leftGlyph && k.rightGlyph === target.rightGlyph,
      );
      if (pair) {
        // `kerning_pairs` has a composite PRIMARY KEY on
        // (project_id, left_glyph, right_glyph), so ON CONFLICT upsert is
        // clean and avoids the extra DELETE round-trip.
        await db.mutate(
          `INSERT INTO kerning_pairs(project_id, left_glyph, right_glyph, value, revision)
           VALUES (?, ?, ?, ?, 0)
           ON CONFLICT(project_id, left_glyph, right_glyph) DO UPDATE SET
             value = excluded.value,
             revision = excluded.revision`,
          [projectId, pair.leftGlyph, pair.rightGlyph, pair.value],
        );
      } else {
        await db.mutate(
          'DELETE FROM kerning_pairs WHERE project_id = ? AND left_glyph = ? AND right_glyph = ?',
          [projectId, target.leftGlyph, target.rightGlyph],
        );
      }
      return;
    }

    case 'component':
      // TODO(components): implement in tandem with editComponentCommand; rows
      // live in `components` + `component_refs` (migration 0002). For now,
      // writes via the 'component' target are unsupported.
      throw new Error(
        'NotImplemented: component mutations — tracked for future components feature',
      );
  }
}
