/// <reference lib="webworker" />
/**
 * Dedicated Web Worker entry for font-io.
 *
 * Receives {@link Request} messages, invokes the appropriate pure function,
 * and posts back a {@link Response}. All thrown errors are caught and
 * forwarded as `{ kind: 'err', message }` so the client's promise rejects.
 */
import { parseOTF, writeOTF } from '../opentype.js';
import { fontToUfo, ufoToFont } from '../ufo/ufo.js';
import type { Request, Response } from './protocol.js';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    let result: unknown;
    if (req.kind === 'parseOTF') result = parseOTF(req.bytes);
    else if (req.kind === 'writeOTF') result = writeOTF(req.font);
    else if (req.kind === 'parseUFO') result = ufoToFont(new Map(req.files));
    else if (req.kind === 'writeUFO') {
      const map = fontToUfo(req.font);
      result = Array.from(map.entries());
    }
    const ok: Response = { id: req.id, kind: 'ok', result };
    ctx.postMessage(ok);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errResp: Response = { id: req.id, kind: 'err', message: msg };
    ctx.postMessage(errResp);
  }
});
