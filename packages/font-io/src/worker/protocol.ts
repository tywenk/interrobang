import type { Font } from '@interrobang/core';

/**
 * Request message sent from the main thread to the font-io Web Worker.
 *
 * The `id` is assigned by {@link FontIoClient} and echoed back in the matching
 * {@link Response} so multiple in-flight requests can be correlated. `kind`
 * narrows the payload shape.
 *
 * UFO `files` are serialized as `[path, bytes][]` because `Map` is not
 * structured-cloneable across some worker boundaries.
 */
export type Request =
  | { id: number; kind: 'parseOTF'; bytes: ArrayBuffer }
  | { id: number; kind: 'writeOTF'; font: Font }
  | { id: number; kind: 'parseUFO'; files: [string, Uint8Array][] }
  | { id: number; kind: 'writeUFO'; font: Font };

/**
 * Response message sent from the worker back to the main thread.
 *
 * @remarks `kind: 'ok'` carries an `unknown` result whose concrete shape is
 *   determined by the original request `kind`; {@link FontIoClient} casts it
 *   at the call site.
 */
export type Response =
  | { id: number; kind: 'ok'; result: unknown }
  | { id: number; kind: 'err'; message: string };
