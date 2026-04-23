import { match, P } from 'ts-pattern';
import * as SQLite from 'wa-sqlite';
/// <reference lib="webworker" />
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

import type { Request, Response, Row, SqlValue } from './protocol.js';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// wa-sqlite is a dynamic WASM-backed API; the emitted type from `SQLite.Factory`
// is `SQLiteAPI` and we keep it loose at the module level to ease drift.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any = null;
let db: number | null = null;

async function open(dbName: string): Promise<void> {
  const module = await SQLiteESMFactory();
  api = SQLite.Factory(module);

  const vfs = await pickVfs(dbName);
  api.vfs_register(vfs, true);
  db = await api.open_v2(dbName);
  // Must be set per-connection and outside a transaction; the schema's
  // ON DELETE CASCADE is only honoured when this is on.
  await api.exec(db, 'PRAGMA foreign_keys = ON');
}

// Preferred path: Origin Private File System via AccessHandlePoolVFS (sync,
// durable, used on browsers that support FileSystemSyncAccessHandle in workers).
// Fallback: IDBBatchAtomicVFS — durable IndexedDB-backed VFS that works on any
// browser with IndexedDB.
//
// We check which store has been used before, because silently swapping VFSes
// across reloads orphans the user's project. In particular: a prior tab or a
// still-teardown-ing worker can hold OPFS sync access handles for a moment;
// the old code used to time out and quietly fall through to a fresh IDB store,
// hiding the OPFS-resident data. Now we refuse to do that.
async function pickVfs(dbName: string): Promise<unknown> {
  const opfsDir = `interrobang-${dbName}`;
  const idbName = `idb-${dbName}`;

  const [opfsHasData, idbHasData] = await Promise.all([
    hasOpfsDirectory(opfsDir),
    hasIdbDatabase(idbName),
  ]);

  if (opfsHasData && idbHasData) {
    throw new Error(
      `Both OPFS (${opfsDir}) and IndexedDB (${idbName}) hold project data. ` +
        `Refusing to pick one — open DevTools → Application and clear the unused store, then reload.`,
    );
  }

  if (idbHasData) return new IDBBatchAtomicVFS(idbName);

  if (opfsHasData) {
    const opfs = await openOpfsVfs(dbName);
    if (!opfs) {
      throw new Error(
        `OPFS holds your project data but its sync access handles are still held (likely by a prior worker). ` +
          `Wait a moment and reload.`,
      );
    }
    return opfs;
  }

  // Fresh state — prefer OPFS, fall back to IDB only when OPFS is unavailable.
  return (await openOpfsVfs(dbName)) ?? new IDBBatchAtomicVFS(idbName);
}

const OPFS_RETRY_DELAYS_MS = [0, 100, 250, 500, 1000];

async function openOpfsVfs(dbName: string): Promise<unknown> {
  for (const delay of OPFS_RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const vfs = new AccessHandlePoolVFS(`/interrobang-${dbName}`);
      const ready = (vfs as { isReady?: Promise<unknown> }).isReady;
      if (ready) await ready;
      return vfs;
    } catch {
      // fall through to next delay
    }
  }
  return null;
}

async function hasOpfsDirectory(dirName: string): Promise<boolean> {
  if (!navigator.storage?.getDirectory) return false;
  try {
    const root = await navigator.storage.getDirectory();
    // Throws NotFoundError if the directory was never created.
    const dir = await root.getDirectoryHandle(dirName, { create: false });
    // AccessHandlePoolVFS provisions a pool of files on first init, so any
    // entry means OPFS was the active VFS for at least one prior session.
    // `values()` exists on FileSystemDirectoryHandle in every browser that
    // ships OPFS but isn't typed in lib.dom.d.ts yet.
    const entries = (dir as unknown as { values(): AsyncIterableIterator<unknown> }).values();
    const first = await entries.next();
    return !first.done;
  } catch {
    return false;
  }
}

async function hasIdbDatabase(name: string): Promise<boolean> {
  if (!indexedDB.databases) return false;
  try {
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === name);
  } catch {
    return false;
  }
}

async function exec(sql: string): Promise<void> {
  if (!api || db === null) throw new Error('DB not open');
  await api.exec(db, sql);
}

async function run(sql: string, params: SqlValue[]): Promise<{ rows: Row[]; changes: number }> {
  if (!api || db === null) throw new Error('DB not open');
  const rows: Row[] = [];
  const stmt = await prepare(sql);
  try {
    bindParams(stmt, params);
    while ((await api.step(stmt)) === SQLite.SQLITE_ROW) {
      rows.push(readRow(stmt));
    }
  } finally {
    await api.finalize(stmt);
  }
  const changes = api.changes(db);
  return { rows, changes };
}

async function prepare(sql: string): Promise<number> {
  // prepare_v2 takes a C-string pointer in the wa-sqlite API; the library
  // ships `str_new`/`str_appendall`/`str_value`/`str_finish` helpers for this.
  // We avoid that complexity by using the `statements()` async iterator (which
  // internally handles the string marshalling), and pull exactly one stmt.
  const iter = api.statements(db, sql)[Symbol.asyncIterator]();
  const next = await iter.next();
  if (next.done || next.value === undefined) throw new Error('No statement');
  // Note: `statements()` auto-finalises when the iterator is closed. Because
  // we never resume the iterator after grabbing the first stmt, we need to
  // mirror manual lifetime management — we call `finalize` in `run()` and
  // abandon the iterator without closing it. This matches wa-sqlite's single
  // statement usage pattern while keeping one SQL string = one prepared stmt.
  return next.value as number;
}

function bindParams(stmt: number, params: SqlValue[]): void {
  for (let i = 0; i < params.length; i++) {
    const p: SqlValue = params[i] ?? null;
    const idx = i + 1;
    match(p)
      .with(P.nullish, () => api.bind_null(stmt, idx))
      .with(P.string, (s) => api.bind_text(stmt, idx, s))
      .with(P.number, (n) => {
        // bind_int is 32-bit and silently fails on values like Date.now().
        // bind_int64 takes BigInt for integers; bind_double for everything else.
        if (Number.isInteger(n)) api.bind_int64(stmt, idx, BigInt(n));
        else api.bind_double(stmt, idx, n);
      })
      .otherwise((b) => api.bind_blob(stmt, idx, b));
  }
}

function readRow(stmt: number): Row {
  const out: Row = {};
  const colCount: number = api.column_count(stmt);
  for (let i = 0; i < colCount; i++) {
    const name: string = api.column_name(stmt, i);
    const type: number = api.column_type(stmt, i);
    out[name] = match(type)
      .with(SQLite.SQLITE_INTEGER, (): SqlValue => {
        const v = api.column_int64(stmt, i);
        return typeof v === 'bigint' ? Number(v) : (v as number);
      })
      .with(SQLite.SQLITE_FLOAT, (): SqlValue => api.column_double(stmt, i))
      .with(SQLite.SQLITE_TEXT, (): SqlValue => api.column_text(stmt, i))
      .with(SQLite.SQLITE_BLOB, (): SqlValue => api.column_blob(stmt, i))
      .otherwise((): SqlValue => null);
  }
  return out;
}

ctx.addEventListener('message', async (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    await match(req)
      .with({ kind: 'open' }, async (r) => {
        await open(r.dbName);
        const res: Response = { id: r.id, kind: 'ok' };
        ctx.postMessage(res);
      })
      .with({ kind: 'exec' }, async (r) => {
        await exec(r.sql);
        const res: Response = { id: r.id, kind: 'ok' };
        ctx.postMessage(res);
      })
      .with({ kind: 'query' }, { kind: 'mutate' }, async (r) => {
        const out = await run(r.sql, r.params);
        const res: Response = {
          id: r.id,
          kind: 'ok',
          rows: out.rows,
          changes: out.changes,
        };
        ctx.postMessage(res);
      })
      .exhaustive();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const res: Response = { id: req.id, kind: 'err', message };
    ctx.postMessage(res);
  }
});
