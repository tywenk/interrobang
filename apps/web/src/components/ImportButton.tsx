import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { getStorage } from '../services/storage';
import { createFontIoWorker } from '@interrobang/font-io';

let client: ReturnType<typeof createFontIoWorker> | null = null;
function fontIo() {
  return (client ??= createFontIoWorker());
}

export function ImportButton() {
  const nav = useNavigate();

  async function importFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.otf,.ttf,.ufo,.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const bytes = await file.arrayBuffer();
      const fontIoClient = fontIo();
      const lower = file.name.toLowerCase();
      const font =
        lower.endsWith('.ufo') || lower.endsWith('.zip')
          ? await fontIoClient.parseUFO(await unzipToMap(new Uint8Array(bytes)))
          : await fontIoClient.parseOTF(bytes);
      const storage = await getStorage();
      const id = await storage.createProject(font.meta.familyName);
      await storage.saveFont(id, { ...font, id });
      await nav({ to: '/project/$projectId', params: { projectId: id } });
    };
    input.click();
  }

  return (
    <Button variant="outline" onClick={importFile}>
      Import OTF / TTF / UFO
    </Button>
  );
}

async function unzipToMap(_bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  throw new Error('UFO import in v1 requires a future zip helper — use OTF/TTF for now');
}
