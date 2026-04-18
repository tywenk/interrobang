import { Button } from '@/components/ui/button';
import { useProjectStore } from '../stores/project-store';
import { getFontIo } from '../services/font-io';

export function ExportButton({ projectId }: { projectId: string }) {
  const proj = useProjectStore((s) => s.openProjects[projectId]);
  if (!proj) return null;

  async function exportOtf() {
    if (!proj) return;
    const bytes = await getFontIo().writeOTF(proj.font);
    const blob = new Blob([new Uint8Array(bytes)], { type: 'font/otf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.font.meta.familyName.replace(/\s+/g, '_')}.otf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return <Button onClick={exportOtf}>Export OTF</Button>;
}
