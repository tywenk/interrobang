import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { EditorCanvasHandle } from '@interrobang/editor';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppServices } from '../app-context';
import { AddGlyphDialog } from '../components/add-glyph-dialog';
import { CoordinatesPanel } from '../components/coordinates-panel';
import { EditorMenuBar } from '../components/editor-menu-bar';
import { EditorShell } from '../components/editor-shell';
import { GlyphList } from '../components/glyph-list';
import { TabBar } from '../components/tab-bar';
import { ToolSidebar } from '../components/tool-sidebar';
import { useAutoSave } from '../hooks/use-auto-save';
import { useEditorKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { projectRoute } from '../router';
import { useProjectStore } from '../stores/project-store';

export function EditorPage() {
  const { projectId } = projectRoute.useParams();
  const { storage } = useAppServices();
  const addOpenProject = useProjectStore((s) => s.addOpenProject);
  const open = useProjectStore((s) => s.openProjects[projectId]);
  const [error, setError] = useState<string | null>(null);

  // Callback ref keeps a synchronous ref (used by the menubar + shortcuts so
  // they can call fitToView without a re-render) alongside React state (so
  // CoordinatesPanel re-renders once the handle is available to subscribe to).
  const canvasRef = useRef<EditorCanvasHandle | null>(null);
  const [canvasHandle, setCanvasHandle] = useState<EditorCanvasHandle | null>(null);
  const setCanvas = useCallback((handle: EditorCanvasHandle | null) => {
    canvasRef.current = handle;
    setCanvasHandle(handle);
  }, []);

  useEditorKeyboardShortcuts(projectId, { canvasRef });
  useAutoSave(projectId);

  useEffect(() => {
    if (open) return;
    storage
      .then((s) => s.loadFont(projectId))
      .then((font) => addOpenProject({ id: projectId, name: font.meta.familyName, font }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [projectId, open, addOpenProject, storage]);

  if (error) return <div className="p-6 text-destructive">{error}</div>;
  return (
    <SidebarProvider className="h-screen">
      <GlyphList projectId={projectId} />
      <SidebarInset className="flex min-w-0 flex-col">
        <EditorMenuBar projectId={projectId} canvasRef={canvasRef} />
        <TabBar activeId={projectId} />
        <div className="flex min-h-0 flex-1">
          <ToolSidebar />
          <div className="relative min-h-0 min-w-0 flex-1">
            <EditorShell projectId={projectId} canvasHandleRef={setCanvas} />
          </div>
          <CoordinatesPanel canvas={canvasHandle} />
        </div>
      </SidebarInset>
      <AddGlyphDialog />
    </SidebarProvider>
  );
}
