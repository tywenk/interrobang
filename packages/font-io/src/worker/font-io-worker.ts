/// <reference lib="webworker" />
/**
 * Dedicated Web Worker entry for font-io.
 *
 * Receives {@link Request} messages, invokes the appropriate pure function,
 * and posts back a {@link Response}. All thrown errors are caught and
 * forwarded as `{ kind: 'err', message }` so the client's promise rejects.
 */
import { match } from 'ts-pattern';
import { parseOTF, writeOTF } from '../opentype.js';
import { fontToUfo, ufoToFont } from '../ufo/ufo.js';
import type { Request, Response } from './protocol.js';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    const result = match(req)
      .with({ kind: 'parseOTF' }, (r) => parseOTF(r.bytes) as unknown)
      .with({ kind: 'writeOTF' }, (r) => writeOTF(r.font) as unknown)
      .with({ kind: 'parseUFO' }, (r) => ufoToFont(new Map(r.files)) as unknown)
      .with({ kind: 'writeUFO' }, (r) => Array.from(fontToUfo(r.font).entries()) as unknown)
      .exhaustive();
    const ok: Response = { id: req.id, kind: 'ok', result };
    ctx.postMessage(ok);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errResp: Response = { id: req.id, kind: 'err', message: msg };
    ctx.postMessage(errResp);
  }
});
