import { Button } from '@/components/ui/button';

import { useAppServices } from '../app-context';
import { exportOTF } from '../services/export-otf';
import { useProjectStore } from '../stores/project-store';

export function ExportButton({ projectId }: { projectId: string }) {
  const proj = useProjectStore((s) => s.openProjects[projectId]);
  const { fontIo } = useAppServices();
  if (!proj) return null;
  return <Button onClick={() => void exportOTF(fontIo, proj.font)}>Export OTF</Button>;
}
