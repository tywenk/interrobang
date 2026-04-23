import type { useNavigate } from '@tanstack/react-router';
import type { BrowserStorageAdapter } from '@interrobang/storage';
import type { FontIoClient } from '@interrobang/font-io';

interface ImportDeps {
  fontIo: FontIoClient;
  storage: Promise<BrowserStorageAdapter>;
  nav: ReturnType<typeof useNavigate>;
}

export function importFontFile({ fontIo, storage, nav }: ImportDeps): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.otf,.ttf,.ufo,.zip';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const bytes = await file.arrayBuffer();
    const lower = file.name.toLowerCase();
    const font =
      lower.endsWith('.ufo') || lower.endsWith('.zip')
        ? await fontIo.parseUFO(await unzipToMap(new Uint8Array(bytes)))
        : await fontIo.parseOTF(bytes);
    const s = await storage;
    const id = await s.createProject(font.meta.familyName);
    await s.saveFont(id, { ...font, id });
    await nav({ to: '/project/$projectId', params: { projectId: id } });
  };
  input.click();
}

async function unzipToMap(_bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  throw new Error('UFO import in v1 requires a future zip helper — use OTF/TTF for now');
}
