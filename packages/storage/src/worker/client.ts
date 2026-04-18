import type { Request, Response, Row, SqlValue } from './protocol.js';

type RequestWithoutId<K extends Request['kind']> = Omit<Extract<Request, { kind: K }>, 'id'>;

export class SqliteClient {
  private nextId = 1;
  private pending = new Map<number, (r: Response) => void>();

  constructor(private worker: Worker) {
    worker.addEventListener('message', (e: MessageEvent<Response>) => {
      const cb = this.pending.get(e.data.id);
      if (cb) {
        this.pending.delete(e.data.id);
        cb(e.data);
      }
    });
  }

  private call<K extends Request['kind']>(
    req: RequestWithoutId<K>,
  ): Promise<Extract<Response, { kind: 'ok' }>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (r) => {
        if (r.kind === 'ok') resolve(r);
        else reject(new Error(r.message));
      });
      this.worker.postMessage({ ...req, id } as unknown as Request);
    });
  }

  open(dbName: string): Promise<void> {
    return this.call<'open'>({ kind: 'open', dbName }).then(() => undefined);
  }

  exec(sql: string): Promise<void> {
    return this.call<'exec'>({ kind: 'exec', sql }).then(() => undefined);
  }

  query(sql: string, params: SqlValue[] = []): Promise<Row[]> {
    return this.call<'query'>({ kind: 'query', sql, params }).then((r) => r.rows ?? []);
  }

  mutate(sql: string, params: SqlValue[] = []): Promise<number> {
    return this.call<'mutate'>({ kind: 'mutate', sql, params }).then((r) => r.changes ?? 0);
  }

  terminate(): void {
    this.worker.terminate();
  }
}

export function createSqliteClient(): SqliteClient {
  const worker = new Worker(new URL('./sqlite-worker.ts', import.meta.url), { type: 'module' });
  return new SqliteClient(worker);
}
