import type { Font } from '@interrobang/core';

export type Request =
  | { id: number; kind: 'parseOTF'; bytes: ArrayBuffer }
  | { id: number; kind: 'writeOTF'; font: Font }
  | { id: number; kind: 'parseUFO'; files: [string, Uint8Array][] }
  | { id: number; kind: 'writeUFO'; font: Font };

export type Response =
  | { id: number; kind: 'ok'; result: unknown }
  | { id: number; kind: 'err'; message: string };
