import migration0000 from '../migrations/0000_initial.sql' with { type: 'text' };

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

const allMigrations = [migration0000];

export function getClientDDL(): string {
  return allMigrations.map((m) => stripStatementsForTables(m, SERVER_ONLY_TABLES)).join('\n\n');
}

export function getServerDDL(): string {
  return allMigrations.join('\n\n');
}

export const MIGRATION_VERSION = allMigrations.length;
