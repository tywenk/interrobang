import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';

import { useAppServices } from '../app-context';
import { importFontFile } from '../services/import-font-file';

export function ImportButton() {
  const nav = useNavigate();
  const { fontIo, storage } = useAppServices();
  return (
    <Button variant="outline" onClick={() => importFontFile({ fontIo, storage, nav })}>
      Import OTF / TTF / UFO
    </Button>
  );
}
