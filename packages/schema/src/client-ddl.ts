import migration0000 from '../migrations/0000_initial.sql' with { type: 'text' };
import migration0001 from '../migrations/0001_schema_versions.sql' with { type: 'text' };
import migration0002 from '../migrations/0002_components.sql' with { type: 'text' };
import migration0003 from '../migrations/0003_font_meta_extra.sql' with { type: 'text' };

const SERVER_ONLY_TABLES = new Set(['users']);

function stripStatementsForTables(sql: string, tables: Set<string>): string {
  // drizzle-kit separates statements with `--> statement-breakpoint` markers.
  // Fall back to blank-line separation for tolerance with hand-edited SQL.
  return sql
    .split(/\s*-->\s*statement-breakpoint\s*|\n\s*\n/)
    .map((stmt) => stmt.trim())
    .filter((stmt) => {
      if (stmt.length === 0) return false;
      const createTable = stmt.match(/CREATE TABLE\s+`?([a-z_]+)`?/i);
      if (createTable && tables.has(createTable[1]!.toLowerCase())) return false;
      // Indexes reference their owning table after ON: CREATE INDEX foo ON `table` (...)
      const indexOn = stmt.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+[^\s]+\s+ON\s+`?([a-z_]+)`?/i);
      if (indexOn && tables.has(indexOn[1]!.toLowerCase())) return false;
      return true;
    })
    .join('\n\n');
}

/**
 * Ordered list of migrations with their integer version number. The version
 * number is the numeric prefix on the `.sql` filename, so keep that in sync
 * when adding new entries.
 */
export interface Migration {
  version: number;
  sql: string;
}

export const migrations: readonly Migration[] = [
  { version: 0, sql: migration0000 },
  { version: 1, sql: migration0001 },
  { version: 2, sql: migration0002 },
  { version: 3, sql: migration0003 },
];

/**
 * Client DDL for initial (fresh-DB) apply. Concatenates all migrations and
 * strips server-only tables. Used by `runMigrations` when the DB has no
 * `schema_versions` table yet.
 */
export function getClientDDL(): string {
  return migrations.map((m) => stripStatementsForTables(m.sql, SERVER_ONLY_TABLES)).join('\n\n');
}

/**
 * Per-migration client DDL. Used by `runMigrations` to apply migrations whose
 * version is greater than the currently recorded one, one transaction each.
 */
export function getClientMigrations(): readonly Migration[] {
  return migrations.map((m) => ({
    version: m.version,
    sql: stripStatementsForTables(m.sql, SERVER_ONLY_TABLES),
  }));
}

export function getServerDDL(): string {
  return migrations.map((m) => m.sql).join('\n\n');
}

/**
 * @deprecated Use the `schema_versions` table. Retained for legacy load path;
 * will be removed after one release cycle.
 */
export const MIGRATION_VERSION = 1;
