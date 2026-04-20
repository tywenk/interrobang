import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as t from './tables.js';

export const tables = t;

export type Project = InferSelectModel<typeof t.projects>;
export type ProjectInsert = InferInsertModel<typeof t.projects>;
export type FontMetaRow = InferSelectModel<typeof t.fontMeta>;
export type MasterRow = InferSelectModel<typeof t.masters>;
export type GlyphRow = InferSelectModel<typeof t.glyphs>;
export type LayerRow = InferSelectModel<typeof t.layers>;
export type KerningPairRow = InferSelectModel<typeof t.kerningPairs>;
export type FeatureRow = InferSelectModel<typeof t.features>;
export type ProjectBlobRow = InferSelectModel<typeof t.projectBlobs>;
export type SyncLogRow = InferSelectModel<typeof t.syncLog>;

export {
  getClientDDL,
  getClientMigrations,
  getServerDDL,
  MIGRATION_VERSION,
  type Migration,
} from './client-ddl.js';
