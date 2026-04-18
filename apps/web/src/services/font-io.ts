import { createFontIoWorker, type FontIoClient } from '@interrobang/font-io';

let client: FontIoClient | null = null;

export function getFontIo(): FontIoClient {
  if (!client) client = createFontIoWorker();
  return client;
}
