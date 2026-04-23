import { getClientDDL, getClientMigrations } from '@interrobang/schema';

import type { SqliteClient } from './worker/client.js';

const APPLIED_AT_SQL = "CAST(strftime('%s','now') AS INTEGER) * 1000";

/**
 * Apply any schema migrations whose version is greater than the highest
 * `schema_versions.version` already recorded.
 *
 * Two paths:
 *   1. Fresh DB (no `schema_versions` table): run the concatenated
 *      `getClientDDL()` blob once inside a transaction. This also creates
 *      `schema_versions` via migration 0001 and seeds initial rows so the
 *      applied-version bookkeeping matches reality going forward.
 *   2. Existing DB: read `MAX(version)` and apply any migration with a
 *      strictly greater version, one transaction per file. Each apply
 *      `INSERT OR IGNORE`s a `schema_versions` row (idempotent with any
 *      inserts the migration SQL itself performs).
 */
export async function runMigrations(db: SqliteClient): Promise<void> {
  const hasVersionsTable = await tableExists(db, 'schema_versions');

  if (!hasVersionsTable) {
    // Could still be a partially-migrated DB that predates the
    // schema_versions table (`PRAGMA user_version >= 1` but no
    // schema_versions). If we detect that, seed the table without replaying
    // 0000 (which would collide on existing CREATE TABLEs).
    const userVersion = await readUserVersion(db);
    if (userVersion >= 1 && (await tableExists(db, 'projects'))) {
      await applyMigrationsAfter(db, -1, { skipVersions: new Set([0]) });
      return;
    }
    await runFreshBootstrap(db);
    return;
  }

  const current = await readMaxAppliedVersion(db);
  await applyMigrationsAfter(db, current);
}

async function runFreshBootstrap(db: SqliteClient): Promise<void> {
  const ddl = getClientDDL();
  await db.exec('BEGIN');
  try {
    await db.exec(ddl);
    // Migration 0001 seeds schema_versions for (0, 0) and (1, 0). For every
    // other known migration that just ran as part of the concatenated DDL,
    // insert a row so `MAX(version)` reflects reality. `OR IGNORE` keeps
    // this idempotent with anything 0001 already seeded.
    for (const m of getClientMigrations()) {
      await db.mutate(
        `INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (?, ${APPLIED_AT_SQL})`,
        [m.version],
      );
    }
    // Clear the legacy PRAGMA so it does not confuse future readers.
    await db.exec('PRAGMA user_version = 0');
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

interface ApplyOpts {
  skipVersions?: Set<number>;
}

async function applyMigrationsAfter(
  db: SqliteClient,
  current: number,
  opts: ApplyOpts = {},
): Promise<void> {
  const all = getClientMigrations();
  const pending = all.filter(
    (m) => m.version > current && !(opts.skipVersions?.has(m.version) ?? false),
  );
  for (const migration of pending) {
    await db.exec('BEGIN');
    try {
      if (migration.sql.trim().length > 0) {
        await db.exec(migration.sql);
      }
      await db.mutate(
        `INSERT OR IGNORE INTO schema_versions(version, applied_at) VALUES (?, ${APPLIED_AT_SQL})`,
        [migration.version],
      );
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  }
}

async function tableExists(db: SqliteClient, name: string): Promise<boolean> {
  const rows = await db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
    name,
  ]);
  return rows.length > 0;
}

async function readUserVersion(db: SqliteClient): Promise<number> {
  const rows = await db.query('PRAGMA user_version');
  return Number((rows[0] as { user_version?: number | string } | undefined)?.user_version ?? 0);
}

async function readMaxAppliedVersion(db: SqliteClient): Promise<number> {
  const rows = await db.query('SELECT MAX(version) AS v FROM schema_versions');
  const v = (rows[0] as { v?: number | string | null } | undefined)?.v;
  if (v === null || v === undefined) return -1;
  return Number(v);
}
