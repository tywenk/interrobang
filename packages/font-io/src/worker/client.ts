import type { Font } from '@interrobang/core';
import type { Request, Response } from './protocol.js';

type RequestWithoutId<K extends Request['kind']> = Omit<Extract<Request, { kind: K }>, 'id'>;

export class FontIoClient {
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

  parseOTF(bytes: ArrayBuffer): Promise<Font> {
    return this.call<'parseOTF', Font>({ kind: 'parseOTF', bytes });
  }
  writeOTF(font: Font): Promise<ArrayBuffer> {
    return this.call<'writeOTF', ArrayBuffer>({ kind: 'writeOTF', font });
  }
  parseUFO(files: Map<string, Uint8Array>): Promise<Font> {
    return this.call<'parseUFO', Font>({ kind: 'parseUFO', files: Array.from(files.entries()) });
  }
  writeUFO(font: Font): Promise<Map<string, Uint8Array>> {
    return this.call<'writeUFO', [string, Uint8Array][]>({ kind: 'writeUFO', font }).then(
      (arr) => new Map(arr),
    );
  }

  terminate(): void {
    this.worker.terminate();
  }
}

export function createFontIoWorker(): FontIoClient {
  const worker = new Worker(new URL('./font-io-worker.ts', import.meta.url), { type: 'module' });
  return new FontIoClient(worker);
}
