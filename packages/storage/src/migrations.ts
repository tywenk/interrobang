import { getClientDDL, MIGRATION_VERSION } from '@interrobang/schema';
import type { SqliteClient } from './worker/client.js';

export async function runMigrations(db: SqliteClient): Promise<void> {
  const rows = await db.query('PRAGMA user_version');
  const current = Number(
    (rows[0] as { user_version?: number | string } | undefined)?.user_version ?? 0,
  );
  if (current >= MIGRATION_VERSION) return;

  const ddl = getClientDDL();
  await db.exec('BEGIN');
  try {
    await db.exec(ddl);
    await db.exec(`PRAGMA user_version = ${MIGRATION_VERSION}`);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}
