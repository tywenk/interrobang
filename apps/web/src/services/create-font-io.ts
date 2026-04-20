import { createFontIoWorker, type FontIoClient } from '@interrobang/font-io';

export function createFontIo(): FontIoClient {
  return createFontIoWorker();
}
