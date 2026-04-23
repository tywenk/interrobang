import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import type { SqliteClient } from './worker/client.js';
import { runMigrations } from './migrations.js';

const require = createRequire(import.meta.url);
interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number | bigint };
  };
}
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

class NodeSqliteClient {
  constructor(private db: DatabaseSync) {}
  query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
    this.db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
  mutate = async (sql: string, params: unknown[] = []): Promise<number> => {
    const info = this.db.prepare(sql).run(...(params as never[]));
    return Number(info.changes);
  };
  exec = async (sql: string): Promise<void> => {
    this.db.exec(sql);
  };
}

function makeClient(): { client: SqliteClient; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = OFF');
  return { client: new NodeSqliteClient(raw) as unknown as SqliteClient, raw };
}

describe('runMigrations', () => {
  it('bootstraps a fresh DB with projects + schema_versions tables', async () => {
    const { client } = makeClient();
    await runMigrations(client);
    const tables = await client.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = tables.map((r) => r['name']);
    expect(names).toContain('projects');
    expect(names).toContain('schema_versions');
  });

  it('records version >= 1 after initial apply', async () => {
    const { client } = makeClient();
    await runMigrations(client);
    const rows = await client.query('SELECT MAX(version) AS v FROM schema_versions');
    const v = Number((rows[0] as { v?: number }).v ?? -1);
    expect(v).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent: applying twice does not throw or duplicate rows', async () => {
    const { client } = makeClient();
    await runMigrations(client);
    const before = await client.query('SELECT COUNT(*) AS c FROM schema_versions');
    await expect(runMigrations(client)).resolves.toBeUndefined();
    const after = await client.query('SELECT COUNT(*) AS c FROM schema_versions');
    expect((after[0] as { c: number }).c).toBe((before[0] as { c: number }).c);
  });

  it('applies migration 0002 (components + component_refs) idempotently', async () => {
    const { client } = makeClient();
    await runMigrations(client);
    // Both runs should succeed and leave the components tables in place.
    await runMigrations(client);
    const tables = await client.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('components', 'component_refs') ORDER BY name",
    );
    expect(tables.map((r) => r['name'])).toEqual(['component_refs', 'components']);
  });
});
