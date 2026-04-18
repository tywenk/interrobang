export type SqlValue = string | number | null | Uint8Array;
export type Row = Record<string, SqlValue>;

export type Request =
  | { id: number; kind: 'open'; dbName: string }
  | { id: number; kind: 'exec'; sql: string }
  | { id: number; kind: 'query'; sql: string; params: SqlValue[] }
  | { id: number; kind: 'mutate'; sql: string; params: SqlValue[] };

export type Response =
  | { id: number; kind: 'ok'; rows?: Row[]; changes?: number }
  | { id: number; kind: 'err'; message: string };
