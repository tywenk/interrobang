import { useEffect, useState } from 'react';
import { projectRoute } from '../router';
import { useAppServices } from '../app-context';
import { useProjectStore } from '../stores/project-store';
import { EditorShell } from '../components/editor-shell';
import { TabBar } from '../components/tab-bar';
import { GlyphList } from '../components/glyph-list';
import { CoordinatesPanel } from '../components/coordinates-panel';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useEditorKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import type { EditorCanvasHandle } from '@interrobang/editor';

export function EditorPage() {
  const { projectId } = projectRoute.useParams();
  const { storage, saveLoop } = useAppServices();
  const addOpenProject = useProjectStore((s) => s.addOpenProject);
  const open = useProjectStore((s) => s.openProjects[projectId]);
  const [error, setError] = useState<string | null>(null);
  const [canvasHandle, setCanvasHandle] = useState<EditorCanvasHandle | null>(null);

  useEditorKeyboardShortcuts(projectId);

  useEffect(() => {
    if (open) return;
    storage
      .then((s) => s.loadFont(projectId))
      .then((font) => addOpenProject({ id: projectId, name: font.meta.familyName, font }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [projectId, open, addOpenProject, storage]);

  useEffect(() => {
    const unsub = useProjectStore.subscribe((s, prev) => {
      const cur = s.openProjects[projectId];
      const old = prev.openProjects[projectId];
      if (cur && cur.dirty && cur !== old) saveLoop.schedule(projectId);
    });
    return () => unsub();
  }, [projectId, saveLoop]);

  if (error) return <div className="p-6 text-destructive">{error}</div>;
  return (
    <SidebarProvider className="h-screen">
      <GlyphList projectId={projectId} />
      <SidebarInset className="flex min-w-0 flex-col">
        <TabBar activeId={projectId} />
        <div className="flex min-h-0 flex-1">
          <div className="relative min-h-0 min-w-0 flex-1">
            <EditorShell projectId={projectId} canvasHandleRef={setCanvasHandle} />
          </div>
          <CoordinatesPanel canvas={canvasHandle} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
