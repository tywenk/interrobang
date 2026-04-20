import { sqliteTable, text, integer, blob, primaryKey, index } from 'drizzle-orm/sqlite-core';

// Server-only. Client schema omits this table entirely.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id'), // null on client
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  revision: integer('revision').notNull().default(0),
});

export const fontMeta = sqliteTable('font_meta', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  familyName: text('family_name').notNull(),
  styleName: text('style_name').notNull().default('Regular'),
  unitsPerEm: integer('units_per_em').notNull().default(1000),
  ascender: integer('ascender').notNull().default(800),
  descender: integer('descender').notNull().default(-200),
  capHeight: integer('cap_height').notNull().default(700),
  xHeight: integer('x_height').notNull().default(500),
  // JSON blob for script-specific metrics (CJK, Arabic, etc.). NULL when the
  // consumer has not populated anything. Opaque to the schema.
  extraMetricsJson: text('extra_metrics_json'),
});

export const masters = sqliteTable('masters', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  weight: integer('weight').notNull().default(400),
  width: integer('width').notNull().default(100),
});

export const glyphs = sqliteTable(
  'glyphs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    advanceWidth: integer('advance_width').notNull().default(500),
    unicodeCodepoint: integer('unicode_codepoint'),
    revision: integer('revision').notNull().default(0),
  },
  (t) => ({
    projectNameIdx: index('idx_glyphs_project_name').on(t.projectId, t.name),
  }),
);

export const layers = sqliteTable('layers', {
  id: text('id').primaryKey(),
  glyphId: text('glyph_id')
    .notNull()
    .references(() => glyphs.id, { onDelete: 'cascade' }),
  masterId: text('master_id')
    .notNull()
    .references(() => masters.id, { onDelete: 'cascade' }),
  contoursJson: text('contours_json').notNull().default('[]'),
  componentsJson: text('components_json').notNull().default('[]'),
  anchorsJson: text('anchors_json').notNull().default('[]'),
});

export const kerningPairs = sqliteTable(
  'kerning_pairs',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    leftGlyph: text('left_glyph').notNull(),
    rightGlyph: text('right_glyph').notNull(),
    value: integer('value').notNull(),
    revision: integer('revision').notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.projectId, t.leftGlyph, t.rightGlyph] }) }),
);

export const features = sqliteTable(
  'features',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    source: text('source').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.projectId, t.tag] }) }),
);

export const projectBlobs = sqliteTable(
  'project_blobs',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    bytes: blob('bytes').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.projectId, t.key] }) }),
);

// Per-migration version tracking. Each applied migration inserts a row with
// the migration number and the epoch-ms timestamp it was applied.
export const schemaVersions = sqliteTable('schema_versions', {
  version: integer('version').primaryKey(),
  appliedAt: integer('applied_at').notNull(),
});

// Scaffold for the future components feature. Tables exist as of migration
// 0002 but no code reads or writes them yet. See
// `packages/storage/src/browser/component-refs.ts` and the Phase 5 plan.
export const components = sqliteTable('components', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  layerJson: text('layer_json').notNull(),
});

export const componentRefs = sqliteTable(
  'component_refs',
  {
    glyphId: text('glyph_id')
      .notNull()
      .references(() => glyphs.id, { onDelete: 'cascade' }),
    layerId: text('layer_id')
      .notNull()
      .references(() => layers.id, { onDelete: 'cascade' }),
    componentId: text('component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.glyphId, t.layerId, t.componentId] }),
    byComponent: index('component_refs_by_component').on(t.componentId),
  }),
);

// Client-only. Server tracks revisions on rows themselves.
export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull(),
  tableName: text('table_name').notNull(),
  rowKey: text('row_key').notNull(),
  revision: integer('revision').notNull(),
  op: text('op', { enum: ['upsert', 'delete'] }).notNull(),
  payload: text('payload'), // JSON
});
