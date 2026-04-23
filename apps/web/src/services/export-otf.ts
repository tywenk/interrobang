import type { Font } from '@interrobang/core';
import type { FontIoClient } from '@interrobang/font-io';

export async function exportOTF(fontIo: FontIoClient, font: Font): Promise<void> {
  const bytes = await fontIo.writeOTF(font);
  const blob = new Blob([new Uint8Array(bytes)], { type: 'font/otf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${font.meta.familyName.replace(/\s+/g, '_')}.otf`;
  a.click();
  URL.revokeObjectURL(url);
}
