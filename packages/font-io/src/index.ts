/**
 * Font-format I/O for the `@interrobang/core` `Font` model.
 *
 * Two pipelines are exposed:
 * - **OpenType/TTF/OTF** via {@link parseOTF} and {@link writeOTF}, built on
 *   `opentype.js`.
 * - **UFO 3** via {@link ufoToFont} and {@link fontToUfo}, covering the plist
 *   metadata files and GLIF 2 glyph outlines.
 *
 * For long-running work in the browser, {@link FontIoClient} (created via
 * {@link createFontIoWorker}) dispatches the same operations to a dedicated
 * Web Worker.
 *
 * @see https://unifiedfontobject.org/versions/ufo3/
 * @packageDocumentation
 */

export { parseOTF, writeOTF } from './opentype.js';
export { fontToUfo, ufoToFont } from './ufo/ufo.js';
export { FontIoClient, createFontIoWorker } from './worker/client.js';
export type { Request as FontIoRequest, Response as FontIoResponse } from './worker/protocol.js';
