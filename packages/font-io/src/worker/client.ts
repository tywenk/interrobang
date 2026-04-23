import type { Font } from '@interrobang/core';
import type { Request, Response } from './protocol.js';

type RequestWithoutId<K extends Request['kind']> = Omit<Extract<Request, { kind: K }>, 'id'>;

/**
 * Main-thread client for the font-io Web Worker.
 *
 * Wraps `postMessage` with a promise-returning API and correlates responses
 * back to their originating requests by auto-incrementing id.
 *
 * Prefer the {@link createFontIoWorker} factory over constructing this
 * directly unless you need to supply your own `Worker` instance.
 */
export class FontIoClient {
  private nextId = 1;
  private pending = new Map<number, (r: Response) => void>();

  /**
   * @param worker - An already-constructed `Worker` whose script runs
   *   `src/worker/font-io-worker.ts`.
   */
  constructor(private worker: Worker) {
    worker.addEventListener('message', (e: MessageEvent<Response>) => {
      const cb = this.pending.get(e.data.id);
      if (cb) {
        this.pending.delete(e.data.id);
        cb(e.data);
      }
    });
  }

  private call<K extends Request['kind'], T>(req: RequestWithoutId<K>): Promise<T> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (r) => {
        if (r.kind === 'ok') resolve(r.result as T);
        else reject(new Error(r.message));
      });
      this.worker.postMessage({ ...req, id } as unknown as Request);
    });
  }

  /**
   * Off-thread version of {@link parseOTF}.
   * @param bytes - Raw OpenType/TTF binary.
   * @returns Promise resolving to the parsed `Font`.
   * @throws If the worker reports an error (e.g. malformed input).
   */
  parseOTF(bytes: ArrayBuffer): Promise<Font> {
    return this.call<'parseOTF', Font>({ kind: 'parseOTF', bytes });
  }

  /**
   * Off-thread version of {@link writeOTF}.
   * @param font - Font to serialize.
   * @returns Promise resolving to an `.otf`/`.ttf` `ArrayBuffer`.
   */
  writeOTF(font: Font): Promise<ArrayBuffer> {
    return this.call<'writeOTF', ArrayBuffer>({ kind: 'writeOTF', font });
  }

  /**
   * Off-thread version of {@link ufoToFont}.
   * @param files - UFO file map keyed by POSIX-style relative paths.
   * @returns Promise resolving to the reconstructed `Font`.
   * @throws If required UFO files are missing or `formatVersion` is not 3.
   */
  parseUFO(files: Map<string, Uint8Array>): Promise<Font> {
    return this.call<'parseUFO', Font>({ kind: 'parseUFO', files: Array.from(files.entries()) });
  }

  /**
   * Off-thread version of {@link fontToUfo}.
   * @param font - Font to serialize.
   * @returns Promise resolving to a `Map` of UFO file paths to file bytes.
   */
  writeUFO(font: Font): Promise<Map<string, Uint8Array>> {
    return this.call<'writeUFO', [string, Uint8Array][]>({ kind: 'writeUFO', font }).then(
      (arr) => new Map(arr),
    );
  }

  /** Stop the underlying worker. After this the client cannot be reused. */
  terminate(): void {
    this.worker.terminate();
  }
}

/**
 * Spawn the font-io worker and return a ready-to-use {@link FontIoClient}.
 *
 * The worker script is resolved relative to this module so bundlers
 * (Vite/esbuild/Turbopack) can pick it up without extra configuration.
 *
 * @returns A client connected to a fresh dedicated worker.
 */
export function createFontIoWorker(): FontIoClient {
  const worker = new Worker(new URL('./font-io-worker.ts', import.meta.url), { type: 'module' });
  return new FontIoClient(worker);
}
