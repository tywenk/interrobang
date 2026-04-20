import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useAppServices } from '../app-context';

export function ImportButton() {
  const nav = useNavigate();
  const { fontIo, storage } = useAppServices();

  async function importFile() {
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

  return (
    <Button variant="outline" onClick={importFile}>
      Import OTF / TTF / UFO
    </Button>
  );
}

async function unzipToMap(_bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  throw new Error('UFO import in v1 requires a future zip helper — use OTF/TTF for now');
}
